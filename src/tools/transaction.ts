import { createHash } from 'node:crypto';
import { ZodError, z } from 'zod';
import { type ToolDefinition } from './types.js';
import { documentTargetSchema } from './focus-lock.js';

export const writeModeSchema = z.enum(['plan', 'preview', 'apply', 'verify']);
export type WriteMode = z.infer<typeof writeModeSchema>;

export const writePlanOutputSchema = z.object({
  success: z.literal(true),
  transaction: z.object({
    id: z.string(),
    toolName: z.string(),
    phase: writeModeSchema,
    willApply: z.boolean(),
    bridgeCallRequired: z.boolean(),
    confirmWriteRequired: z.boolean(),
    confirmWriteSatisfied: z.boolean(),
    risk: z.enum(['low', 'medium', 'high']),
    requiredScopes: z.array(z.string()),
    summary: z.string(),
    inputPreview: z.record(z.string(), z.unknown()),
    nextStep: z
      .object({
        writeMode: z.literal('apply'),
        confirmWrite: z.literal(true),
      })
      .optional(),
  }),
});

export function getRawInput(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

export function parseWriteMode(raw: Record<string, unknown>): WriteMode | ZodError {
  if (raw.writeMode === undefined) return 'apply';
  const parsed = writeModeSchema.safeParse(raw.writeMode);
  return parsed.success ? parsed.data : parsed.error;
}

export function omitWriteControls(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const {
    confirmWrite: _confirmWrite,
    writeMode: _writeMode,
    ...rest
  } = input as Record<string, unknown>;
  return rest;
}

function transactionId(
  toolName: string,
  phase: WriteMode,
  inputPreview: Record<string, unknown>,
): string {
  const payload = JSON.stringify({ toolName, phase, inputPreview });
  return `wtx_${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}

export function writePlanResponse(
  tool: ToolDefinition,
  phase: Exclude<WriteMode, 'apply'>,
  inputPreview: Record<string, unknown>,
  requiredScopes: string[],
) {
  const transaction = {
    id: transactionId(tool.name, phase, inputPreview),
    toolName: tool.name,
    phase,
    willApply: false,
    bridgeCallRequired: false,
    confirmWriteRequired: true,
    confirmWriteSatisfied: false,
    risk: tool.risk,
    requiredScopes,
    summary:
      phase === 'verify'
        ? `Verification checkpoint prepared for "${tool.name}". No bridge call was executed; run read-only diagnostics after apply to verify project state.`
        : `${phase === 'plan' ? 'Plan' : 'Preview'} prepared for "${tool.name}". No bridge call was executed.`,
    inputPreview,
    nextStep:
      phase === 'verify'
        ? undefined
        : {
            writeMode: 'apply' as const,
            confirmWrite: true as const,
          },
  };

  const structuredContent = writePlanOutputSchema.parse({ success: true, transaction });
  return {
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  };
}

export function registeredInputSchema(tool: ToolDefinition): z.ZodType {
  if (!tool.confirmWrite) return tool.inputSchema;
  // Only object schemas can carry the write-control fields. All confirmWrite
  // tools use z.object today; guard anyway so a non-object schema is left as-is.
  if (!(tool.inputSchema instanceof z.ZodObject)) return tool.inputSchema;
  // The MCP SDK validates the tool arguments against the REGISTERED input schema
  // and strips any key the schema does not declare BEFORE the registry wrapper
  // runs. writeMode is not part of any tool's own inputSchema, so without adding
  // it here it is silently dropped and every writeMode="plan"/"preview" call
  // falls through to a real apply (a "dry run" that mutates the design). Declare
  // it on the registered schema so plan/preview are honored. confirmWrite is
  // relaxed to optional here so a dry run does not require it; the registry
  // wrapper still enforces confirmWrite===true for the apply path.
  // `document` lets a write target a specific tab (headless multi-tab). The MCP
  // SDK strips undeclared keys before the registry wrapper runs, so it must be
  // declared here for the registry to see raw.document and focus that tab first.
  //
  // We OVERWRITE the existing confirmWrite key (relaxing z.literal(true) to
  // optional so plan/preview do not require it). In zod v4, ZodObject.extend()
  // THROWS ("Cannot overwrite keys on object schemas containing refinements")
  // when the tool's inputSchema carries a .refine()/.superRefine() - e.g.
  // easyeda_pcb_add_solid_region. Left unhandled this crashes the whole server
  // on startup at any profile that registers such a tool (-32000 Connection
  // closed). .safeExtend() performs the same overwrite while preserving the
  // refinement; fall back to .extend() only if safeExtend is unavailable
  // (older zod). The real per-call validation still runs against the original
  // refined tool.inputSchema in the registry, so no validation is lost.
  const objectSchema = tool.inputSchema as z.ZodObject<z.ZodRawShape> & {
    safeExtend?: (shape: z.ZodRawShape) => z.ZodType;
  };
  const extraShape: z.ZodRawShape = {
    confirmWrite: z.literal(true).optional(),
    writeMode: writeModeSchema.optional(),
    document: documentTargetSchema.optional(),
  };
  if (typeof objectSchema.safeExtend === 'function') {
    return objectSchema.safeExtend(extraShape);
  }
  return objectSchema.extend(extraShape);
}

export function registeredOutputSchema(tool: ToolDefinition): z.ZodType {
  if (!tool.confirmWrite) return tool.outputSchema;
  // A confirmWrite tool can return either its normal output (apply mode) or a
  // write-plan envelope (plan/preview/verify mode). Representing that as
  // z.union([...]) breaks the MCP SDK's output-schema handling — the SDK expects
  // an object schema and throws "Cannot read properties of undefined (reading
  // '_zod')" at call time, which is why every write tool errored on its response
  // even though the bridge call succeeded. Both possible shapes are objects, and
  // the handler already validates the precise shape itself (registry uses
  // tool.outputSchema.safeParse for apply, writePlanResponse pre-validates for
  // plan/preview), so publish a permissive object schema here to keep the SDK
  // happy while preserving the real validation upstream.
  return z.object({}).passthrough();
}
