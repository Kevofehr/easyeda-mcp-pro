import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from './types.js';
import { resolveArtifactPath, writeArtifactFile } from './artifact-write.js';
import { type EnvConfig } from '../config/env.js';

interface BomRow {
  reference?: string;
  value?: string;
  footprint?: string;
  lcsc?: string;
  quantity?: number;
  manufacturer?: string;
}

const BOM_EXPORT_COLUMNS = [
  'reference',
  'value',
  'footprint',
  'lcsc',
  'quantity',
  'manufacturer',
] as const;

/**
 * Quote a single CSV field per RFC 4180: wrap in double quotes when the value
 * contains a delimiter, a quote or a line break, doubling any embedded quote.
 *
 * `reference` in particular is a comma-joined designator list ("R1, R2, R3"),
 * so it always needs quoting - an unescaped write would silently corrupt every
 * grouped row into extra columns.
 */
function csvField(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function bomRowsToCsv(rows: BomRow[]): string {
  const lines = [BOM_EXPORT_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(BOM_EXPORT_COLUMNS.map((column) => csvField(row[column])).join(','));
  }
  // Trailing newline so the file is a well-formed text file even when empty of rows.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Normalize the bridge's `bom.generate` reply into BOM rows.
 *
 * The bridge extension returns a plain JSON array of grouped components (see
 * `easyeda-bridge-extension/src/read-only-operations.ts` `generateBom`). It has
 * never returned a file or an `entryCount`, which is why this tool used to report
 * a phantom success. Anything that is not an array is a bridge-protocol failure
 * and must surface as an honest error rather than an empty "successful" export.
 */
function toBomRows(result: unknown): BomRow[] | undefined {
  if (!Array.isArray(result)) return undefined;
  return result.filter((row): row is BomRow => Boolean(row) && typeof row === 'object');
}

function serializeBom(
  rows: BomRow[],
  format: string,
): { buffer: Buffer; error?: undefined } | { buffer?: undefined; error: string } {
  if (format === 'csv') {
    return { buffer: Buffer.from(bomRowsToCsv(rows), 'utf-8') };
  }
  if (format === 'json') {
    return { buffer: Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, 'utf-8') };
  }
  return {
    error:
      `Format "${format}" cannot be written by the server: the EasyEDA bridge returns BOM rows as ` +
      'JSON, not a spreadsheet file. Export as "csv" or "json" instead.',
  };
}

function registerBomCoreTools(
  registry: { register: (def: ToolDefinition) => void },
  _config: EnvConfig,
) {
  registry.register({
    name: 'easyeda_bom_generate',
    title: 'Generate BOM',
    description:
      'Generate a bill of materials for the project with grouping and formatting options.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'bom',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({
      projectId: z.string(),
      format: z.enum(['csv', 'json', 'xlsx']).default('json'),
      groupBy: z.enum(['value', 'lcsc', 'footprint']).default('value'),
    }),
    outputSchema: z.object({
      project_id: z.string(),
      format: z.string(),
      group_by: z.string(),
      entries: z.array(
        z.object({
          reference: z.string(),
          value: z.string(),
          footprint: z.string(),
          lcsc: z.string().optional(),
          quantity: z.number().int().nonnegative(),
          manufacturer: z.string().optional(),
        }),
      ),
      total_entries: z.number().int().nonnegative(),
      not_available: z.boolean().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { projectId, format, groupBy } = params as {
        projectId: string;
        format: string;
        groupBy: string;
      };
      try {
        const result = await ctx.bridge.call('bom.generate', { projectId, format, groupBy });
        const entries = result as Array<{
          reference?: string;
          value?: string;
          footprint?: string;
          lcsc?: string;
          quantity?: number;
          manufacturer?: string;
        }>;
        const validEntries = (entries ?? []).filter((entry) => entry.reference?.trim());
        return {
          project_id: projectId,
          format,
          group_by: groupBy,
          entries: validEntries.map((e) => ({
            reference: e.reference ?? '',
            value: e.value ?? '',
            footprint: e.footprint ?? '',
            lcsc: e.lcsc,
            quantity: e.quantity ?? 0,
            manufacturer: e.manufacturer,
          })),
          total_entries: validEntries.length,
        };
      } catch (err) {
        return {
          project_id: projectId,
          format,
          group_by: groupBy,
          entries: [],
          total_entries: 0,
          not_available: true,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  registry.register({
    name: 'easyeda_bom_validate',
    title: 'Validate BOM',
    description:
      'Validate the project BOM against LCSC inventory to identify missing, obsolete, or alternate parts.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'medium',
    confirmWrite: false,
    group: 'bom',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({
      projectId: z.string(),
    }),
    outputSchema: z.object({
      project_id: z.string(),
      total_parts: z.number().int().nonnegative(),
      missing_lcsc: z.array(z.string()),
      invalid_lcsc: z.array(z.string()),
      obsolete: z.array(z.string()),
      valid_count: z.number().int().nonnegative(),
      validated: z.boolean(),
      not_available: z.boolean().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { projectId } = params as { projectId: string };
      try {
        const bomResult = await ctx.bridge.call('bom.generate', {
          projectId,
          format: 'json',
          groupBy: 'lcsc',
        });
        const entries = bomResult as Array<{ lcsc?: string; reference: string; value: string }>;

        const missing: string[] = [];
        const invalid: string[] = [];
        const obsolete: string[] = [];

        for (const entry of entries ?? []) {
          if (!entry.lcsc) {
            missing.push(entry.reference);
            continue;
          }

          if (ctx.vendors.lcsc) {
            try {
              const detail = await ctx.vendors.lcsc.getPartDetail(entry.lcsc);
              if (!detail) {
                invalid.push(entry.reference);
              } else if (detail.discontinued) {
                obsolete.push(entry.reference);
              }
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_err) {
              // LCSC lookup failed for this part
              invalid.push(entry.reference);
            }
          }
        }

        return {
          project_id: projectId,
          total_parts: entries?.length ?? 0,
          missing_lcsc: missing,
          invalid_lcsc: invalid,
          obsolete: obsolete,
          valid_count: (entries?.length ?? 0) - missing.length - invalid.length - obsolete.length,
          validated: true,
        };
      } catch (err) {
        return {
          project_id: projectId,
          total_parts: 0,
          missing_lcsc: [],
          invalid_lcsc: [],
          obsolete: [],
          valid_count: 0,
          validated: false,
          not_available: true,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  registry.register({
    name: 'easyeda_bom_export',
    title: 'Export BOM',
    description: 'Export the bill of materials to a file on disk in the specified format.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'bom',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: z.object({
      projectId: z.string(),
      format: z.enum(['csv', 'json', 'xlsx']).default('csv'),
      filePath: z.string(),
    }),
    outputSchema: z.object({
      project_id: z.string(),
      format: z.string(),
      file_path: z.string(),
      exported: z.boolean(),
      entry_count: z.number().int().nonnegative().optional(),
      byte_length: z.number().int().nonnegative().optional(),
      not_available: z.boolean().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { projectId, format, filePath } = params as {
        projectId: string;
        format: string;
        filePath: string;
      };
      const failure = (error: string) => ({
        project_id: projectId,
        format,
        file_path: filePath,
        exported: false,
        not_available: true,
        error,
      });

      // Validate the destination before touching the design, so a sandbox
      // escape never costs a bridge round-trip.
      const destination = resolveArtifactPath(ctx, filePath, `${projectId}-bom.${format}`);
      if (!destination.ok) {
        return failure(destination.error);
      }

      try {
        // The bridge only ever returns BOM rows as JSON; the file itself is
        // serialized and written here, server-side, so `exported` reflects disk.
        const result = await ctx.bridge.call('bom.generate', {
          projectId,
          format: 'json',
          groupBy: 'value',
        });
        const rows = toBomRows(result);
        if (rows === undefined) {
          return failure(
            'Bridge did not return BOM rows for bom.generate, so no BOM file was written. ' +
              'The EasyEDA bridge extension may be missing or out of date.',
          );
        }
        const serialized = serializeBom(rows, format);
        if (serialized.error !== undefined) {
          return failure(serialized.error);
        }

        const written = writeArtifactFile(
          ctx,
          serialized.buffer,
          filePath,
          `${projectId}-bom.${format}`,
        );
        if (!written.ok) {
          return failure(written.error ?? 'Failed to write the BOM export file.');
        }

        return {
          project_id: projectId,
          format,
          file_path: written.filePath as string,
          exported: true,
          entry_count: rows.length,
          byte_length: written.byteLength,
        };
      } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
      }
    },
  });
}

export { registerBomCoreTools };
