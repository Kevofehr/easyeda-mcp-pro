import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from './types.js';
import { type EnvConfig } from '../config/env.js';
import { planComponentGroupPlacement, planRoutePath } from '../pcb-layout/index.js';

const execFileAsync = promisify(execFile);

// Shared output shape for the primitive-authoring PCB write tools.
const pcbWriteOutputSchema = z.object({
  success: z.boolean(),
  primitiveId: z.string().optional(),
  segmentIds: z.array(z.string()).optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

// Call a bridge write method and normalize the result to pcbWriteOutputSchema.
// Never throws — bridge/API failures come back as { success: false, error }.
async function bridgeWrite(
  ctx: ToolContext,
  method: string,
  params: Record<string, unknown>,
): Promise<{
  success: boolean;
  primitiveId?: string;
  segmentIds?: string[];
  result?: unknown;
  error?: string;
}> {
  try {
    const result = await ctx.bridge.call<Record<string, unknown>, unknown>(method, params);
    if (typeof result === 'string') return { success: true, primitiveId: result, result };
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      return {
        success: true,
        primitiveId: (r.primitiveId as string | undefined) ?? (r.result as string | undefined),
        segmentIds: r.segmentIds as string[] | undefined,
        result,
      };
    }
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Flatten [{x,y},...] to [x,y,x,y,...]; the extension's toXYPairs accepts either.
function flattenPoints(points: Array<{ x: number; y: number }> | undefined): number[] | undefined {
  return points ? points.flatMap((pt) => [pt.x, pt.y]) : undefined;
}

// EPCB_LayerId values printed on the underside of the board. When the board is
// flipped to the bottom view it is mirrored across the vertical (Y) axis, which
// reflects any rotation. (bottom copper=2, silk=4, mask=6, paste=8, assembly=10,
// stiffener=59.)
const BOTTOM_SIDE_LAYERS = new Set([2, 4, 6, 8, 10, 59]);

// Normalize an angle to [0, 360) — EasyEDA rotations are positive-only.
function normalizeAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

// Resolve the stored rotation for a silkscreen/text primitive given the frame
// the rotation was authored in.
//   frame "stored"       -> rotation used verbatim (default; backward-compatible).
//   frame "bottom-view"  -> the rotation was computed in the top-plane reading
//                           frame; reflect it (360 - r, normalized) so the text
//                           reads correctly once the board is flipped to view
//                           the bottom. Applies ONLY to bottom-side layers; on a
//                           top-side layer it is a no-op (the value is returned
//                           unchanged, so an accidental frame flag can't silently
//                           corrupt top silk).
// See docs/reference/pcb-authoring-gotchas.md.
export function resolveSilkscreenRotation(
  rotation: number,
  layer: number,
  frame: 'stored' | 'bottom-view',
): number {
  if (frame === 'bottom-view' && BOTTOM_SIDE_LAYERS.has(layer)) {
    return normalizeAngle(360 - rotation);
  }
  return rotation;
}

const layoutPointSchema = z.object({ x: z.number(), y: z.number() });
const layoutBoardSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
});
const layoutRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  name: z.string().optional(),
});
const layoutIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  remediationHint: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
const layoutOperationSchema = z.object({
  method: z.string(),
  params: z.record(z.string(), z.unknown()),
});
const layoutApplyResultSchema = z.object({
  method: z.string(),
  success: z.boolean(),
  primitiveId: z.string().optional(),
  error: z.string().optional(),
});

async function applyLayoutOperations(
  ctx: ToolContext,
  operations: Array<{ method: string; params: Record<string, unknown> }>,
) {
  const results: Array<{ method: string; success: boolean; primitiveId?: string; error?: string }> =
    [];
  for (const operation of operations) {
    try {
      const result = await ctx.bridge.call<
        Record<string, unknown>,
        { primitiveId?: string; result?: string }
      >(operation.method, operation.params);
      const data = result as { primitiveId?: string; result?: string } | string;
      results.push({
        method: operation.method,
        success: true,
        primitiveId:
          typeof data === 'string' ? data : (data?.primitiveId ?? data?.result ?? undefined),
      });
    } catch (error) {
      results.push({
        method: operation.method,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return results;
}

function registerPcbWriteTools(
  registry: { register: (def: ToolDefinition) => void },
  _config: EnvConfig,
) {
  registry.register({
    name: 'easyeda_pcb_place_component_group',
    title: 'Plan or apply grouped PCB component placement',
    description:
      'Create a high-level, constraint-checked placement plan for a group of components and optionally apply it after explicit confirmation.',
    profile: 'full',
    evidence: ['inferred'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: z.object({
      projectId: z.string().optional(),
      mode: z.enum(['preview', 'apply']).default('preview'),
      board: layoutBoardSchema,
      anchor: layoutPointSchema,
      columns: z.number().int().positive().optional(),
      spacingMm: z.number().nonnegative().optional(),
      layer: z.number().int().default(1),
      minSpacingMm: z.number().nonnegative().optional(),
      components: z.array(
        z.object({
          ref: z.string(),
          primitiveId: z.string().optional(),
          footprint: z.string().optional(),
          widthMm: z.number().positive(),
          heightMm: z.number().positive(),
          rotation: z.number().optional(),
          fixed: z.boolean().optional(),
        }),
      ),
      keepouts: z.array(layoutRectSchema).optional(),
      confirmWrite: z.boolean().optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      project_id: z.string(),
      transaction_id: z.string(),
      mode: z.string(),
      applied: z.boolean(),
      blocked: z.boolean(),
      placements: z.array(
        z.object({
          ref: z.string(),
          primitiveId: z.string().optional(),
          footprint: z.string().optional(),
          x: z.number(),
          y: z.number(),
          rotation: z.number(),
          layer: z.number(),
          widthMm: z.number(),
          heightMm: z.number(),
          bbox: layoutRectSchema,
        }),
      ),
      operations: z.array(layoutOperationSchema),
      apply_results: z.array(layoutApplyResultSchema).optional(),
      issues: z.array(layoutIssueSchema),
      summary: z.string(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as Parameters<typeof planComponentGroupPlacement>[0];
      const plan = planComponentGroupPlacement(p);
      if (p.mode !== 'apply') {
        return {
          success: !plan.blocked,
          project_id: plan.projectId,
          transaction_id: plan.transactionId,
          mode: plan.mode,
          applied: false,
          blocked: plan.blocked,
          placements: plan.placements,
          operations: plan.operations,
          issues: plan.issues,
          summary: plan.summary,
        };
      }
      if (plan.blocked) {
        return {
          success: false,
          project_id: plan.projectId,
          transaction_id: plan.transactionId,
          mode: plan.mode,
          applied: false,
          blocked: true,
          placements: plan.placements,
          operations: plan.operations,
          issues: plan.issues,
          summary: plan.summary,
          error: 'Placement plan contains blocking constraint errors.',
        };
      }
      if (p.confirmWrite !== true) {
        return {
          success: false,
          project_id: plan.projectId,
          transaction_id: plan.transactionId,
          mode: plan.mode,
          applied: false,
          blocked: true,
          placements: plan.placements,
          operations: plan.operations,
          issues: plan.issues,
          summary: 'Apply blocked because confirmWrite=true was not provided.',
          error: 'confirmWrite=true is required to apply grouped component placement.',
        };
      }
      const applyResults = await applyLayoutOperations(ctx, plan.operations);
      const failed = applyResults.some((result) => !result.success);
      return {
        success: !failed,
        project_id: plan.projectId,
        transaction_id: plan.transactionId,
        mode: plan.mode,
        applied: !failed,
        blocked: false,
        placements: plan.placements,
        operations: plan.operations,
        apply_results: applyResults,
        issues: plan.issues,
        summary: failed
          ? 'Placement apply failed before all operations completed.'
          : `Applied ${applyResults.length} placement operation(s).`,
        error: applyResults.find((result) => !result.success)?.error,
      };
    },
  });

  registry.register({
    name: 'easyeda_pcb_route_path_plan',
    title: 'Plan or apply constrained PCB route path',
    description:
      'Create a high-level, constraint-checked route path plan for one net and optionally apply it after explicit confirmation.',
    profile: 'full',
    evidence: ['inferred'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: z.object({
      projectId: z.string().optional(),
      mode: z.enum(['preview', 'apply']).default('preview'),
      board: layoutBoardSchema.optional(),
      netName: z.string(),
      layer: z.number().int(),
      widthMm: z.number().positive(),
      waypoints: z.array(layoutPointSchema),
      keepouts: z.array(layoutRectSchema).optional(),
      maxLengthMm: z.number().positive().optional(),
      minWidthMm: z.number().positive().optional(),
      confirmWrite: z.boolean().optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      project_id: z.string(),
      transaction_id: z.string(),
      mode: z.string(),
      applied: z.boolean(),
      blocked: z.boolean(),
      net_name: z.string(),
      layer: z.number(),
      width_mm: z.number(),
      path_length_mm: z.number(),
      operations: z.array(layoutOperationSchema),
      apply_results: z.array(layoutApplyResultSchema).optional(),
      issues: z.array(layoutIssueSchema),
      summary: z.string(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as Parameters<typeof planRoutePath>[0];
      const plan = planRoutePath(p);
      const base = {
        project_id: plan.projectId,
        transaction_id: plan.transactionId,
        mode: plan.mode,
        applied: false,
        blocked: plan.blocked,
        net_name: plan.netName,
        layer: plan.layer,
        width_mm: plan.widthMm,
        path_length_mm: plan.pathLengthMm,
        operations: plan.operations,
        issues: plan.issues,
      };
      if (p.mode !== 'apply') return { success: !plan.blocked, ...base, summary: plan.summary };
      if (plan.blocked) {
        return {
          success: false,
          ...base,
          blocked: true,
          summary: plan.summary,
          error: 'Route plan contains blocking constraint errors.',
        };
      }
      if (p.confirmWrite !== true) {
        return {
          success: false,
          ...base,
          blocked: true,
          summary: 'Apply blocked because confirmWrite=true was not provided.',
          error: 'confirmWrite=true is required to apply route path plan.',
        };
      }
      const applyResults = await applyLayoutOperations(ctx, plan.operations);
      const failed = applyResults.some((result) => !result.success);
      return {
        success: !failed,
        ...base,
        applied: !failed,
        blocked: false,
        apply_results: applyResults,
        summary: failed
          ? 'Route apply failed before all operations completed.'
          : `Applied ${applyResults.length} route operation(s).`,
        error: applyResults.find((result) => !result.success)?.error,
      };
    },
  });

  registry.register({
    name: 'easyeda_pcb_place_component',
    title: 'Place component on PCB',
    description:
      'Place a component footprint on the active PCB layout. The real EasyEDA API (PCB_PrimitiveComponent.create) requires a library ITEM OBJECT, so pass libraryUuid + uuid (device or footprint) — a bare footprint string is a legacy fallback that generally will not resolve. layer: 1=TOP, 2=BOTTOM.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.1.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: z.object({
      libraryUuid: z.string().optional(),
      uuid: z.string().optional(),
      footprint: z.string().optional(),
      x: z.number(),
      y: z.number(),
      rotation: z.number().default(0),
      layer: z.number().default(1),
      confirmWrite: z.literal(true),
    }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        libraryUuid?: string;
        uuid?: string;
        footprint?: string;
        x: number;
        y: number;
        rotation: number;
        layer: number;
      };
      return bridgeWrite(ctx, 'pcb.placeComponent', {
        libraryUuid: p.libraryUuid,
        uuid: p.uuid,
        footprint: p.footprint,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        layer: p.layer,
      });
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_track',
    title: 'Add PCB track',
    description: 'Draw a copper track/trace segment on the PCB board.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: z.object({
      points: z.array(z.object({ x: z.number(), y: z.number() })),
      layer: z.number(),
      width: z.number(),
      netName: z.string().optional(),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      primitiveId: z.string().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        points: Array<{ x: number; y: number }>;
        layer: number;
        width: number;
        netName?: string;
      };
      try {
        const flatPoints = p.points.flatMap((pt) => [pt.x, pt.y]);
        const result = await ctx.bridge.call<
          Record<string, unknown>,
          { primitiveId?: string; result?: string }
        >('pcb.addTrack', {
          points: flatPoints,
          layer: p.layer,
          width: p.width,
          netName: p.netName,
        });
        const data = result as { primitiveId?: string; result?: string } | string;
        return {
          success: true,
          primitiveId:
            typeof data === 'string' ? data : (data?.primitiveId ?? data?.result ?? undefined),
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_via',
    title: 'Add PCB via',
    description: 'Place a via to connect different copper layers on the PCB board.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      outerDiameter: z.number(),
      holeSize: z.number(),
      netName: z.string().optional(),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      primitiveId: z.string().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        x: number;
        y: number;
        outerDiameter: number;
        holeSize: number;
        netName?: string;
      };
      try {
        const result = await ctx.bridge.call<
          Record<string, unknown>,
          { primitiveId?: string; result?: string }
        >('pcb.addVia', {
          x: p.x,
          y: p.y,
          outerDiameter: p.outerDiameter,
          holeSize: p.holeSize,
          netName: p.netName,
        });
        const data = result as { primitiveId?: string; result?: string } | string;
        return {
          success: true,
          primitiveId:
            typeof data === 'string' ? data : (data?.primitiveId ?? data?.result ?? undefined),
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_zone',
    title: 'Add PCB copper zone/pour',
    description: 'Create a copper pour zone on a specific layer with clearance settings.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: z.object({
      points: z.array(z.object({ x: z.number(), y: z.number() })),
      layer: z.number(),
      netName: z.string().optional(),
      clearance: z.number().optional(),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      primitiveId: z.string().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        points: Array<{ x: number; y: number }>;
        layer: number;
        netName?: string;
        clearance?: number;
      };
      try {
        const flatPoints = p.points.flatMap((pt) => [pt.x, pt.y]);
        const result = await ctx.bridge.call<
          Record<string, unknown>,
          { primitiveId?: string; result?: string }
        >('pcb.addZone', {
          points: flatPoints,
          layer: p.layer,
          netName: p.netName,
          clearance: p.clearance,
        });
        const data = result as { primitiveId?: string; result?: string } | string;
        return {
          success: true,
          primitiveId:
            typeof data === 'string' ? data : (data?.primitiveId ?? data?.result ?? undefined),
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  registry.register({
    name: 'easyeda_pcb_delete_component',
    title: 'Delete PCB components',
    description: 'Delete components from the PCB layout by their primitive IDs.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
    inputSchema: z.object({
      primitiveIds: z.array(z.string()),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      deletedCount: z.number().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as { primitiveIds: string[] };
      try {
        await ctx.bridge.call<Record<string, unknown>, { primitiveId?: string; result?: string }>(
          'pcb.deleteComponent',
          {
            primitiveIds: p.primitiveIds,
          },
        );
        return {
          success: true,
          deletedCount: p.primitiveIds.length,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  registry.register({
    name: 'easyeda_pcb_modify_component',
    title: 'Modify PCB component properties',
    description: 'Modify component properties in the PCB layout.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: z.object({
      primitiveId: z.string(),
      property: z.record(z.string(), z.unknown()),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as { primitiveId: string; property: Record<string, unknown> };
      try {
        await ctx.bridge.call<Record<string, unknown>, { primitiveId?: string; result?: string }>(
          'pcb.modifyComponent',
          {
            primitiveId: p.primitiveId,
            property: p.property,
          },
        );
        return {
          success: true,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // -------------------------------------------------------------------------
  // v0.6.0 PCB authoring + import tools (real EasyEDA Pro class/method names,
  // confirmed against @jlceda/pro-api-types).
  // -------------------------------------------------------------------------

  registry.register({
    name: 'easyeda_pcb_add_board_outline',
    title: 'Add PCB board outline',
    description:
      'Author the board frame on the Board Outline layer (EPCB_LayerId 11). shape="rect" (x,y,width,height), "circle" (cx,cy,radius), or "polygon" (points). Draws closed line/arc geometry that EasyEDA treats as the board shape.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z
      .object({
        shape: z.enum(['rect', 'circle', 'polygon']).default('rect'),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        cx: z.number().optional(),
        cy: z.number().optional(),
        radius: z.number().optional(),
        points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
        lineWidth: z.number().default(0.2),
        confirmWrite: z.literal(true),
      })
      .superRefine((val, ctx) => {
        const require = (keys: string[]) => {
          for (const k of keys) {
            if ((val as Record<string, unknown>)[k] === undefined) {
              ctx.addIssue({
                code: 'custom',
                message: `shape "${val.shape}" requires "${k}"`,
                path: [k],
              });
            }
          }
        };
        if (val.shape === 'circle') require(['cx', 'cy', 'radius']);
        else if (val.shape === 'polygon') {
          if (!val.points || val.points.length < 3) {
            ctx.addIssue({
              code: 'custom',
              message: 'shape "polygon" requires a points array with at least 3 points',
              path: ['points'],
            });
          }
        } else require(['x', 'y', 'width', 'height']);
      }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        shape?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        cx?: number;
        cy?: number;
        radius?: number;
        points?: Array<{ x: number; y: number }>;
        lineWidth?: number;
      };
      const bp: Record<string, unknown> = {
        shape: p.shape ?? 'rect',
        lineWidth: p.lineWidth ?? 0.2,
      };
      const pts = flattenPoints(p.points);
      if (pts) bp.points = pts;
      for (const k of ['x', 'y', 'width', 'height', 'cx', 'cy', 'radius'] as const) {
        if (p[k] !== undefined) bp[k] = p[k];
      }
      return bridgeWrite(ctx, 'pcb.addBoardOutline', bp);
    },
  });

  registry.register({
    name: 'easyeda_pcb_document_save',
    title: 'Save PCB document',
    description:
      'Persist extension-authored PCB primitives via PCB_Document.save(uuid). EasyEDA does not preserve API-created objects until the document is saved, and save() will not persist without a real document uuid — so documentUuid (the open PCB/board uuid) is REQUIRED.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'medium',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.1.0',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    inputSchema: z.object({
      documentUuid: z.string().min(1),
      confirmWrite: z.literal(true),
    }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as { documentUuid: string };
      return bridgeWrite(ctx, 'pcb.save', { documentUuid: p.documentUuid });
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_pad',
    title: 'Add PCB pad',
    description:
      'Add an SMD or through-hole pad (PCB_PrimitivePad.create). SMD: layer 1|2, omit holeDiameter. THT: provide holeDiameter (auto-placed on MULTI layer 12). padShape defaults to a round ELLIPSE sized by width/height; pass an explicit padShape/hole array to override.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      layer: z.number().optional(),
      padNumber: z.string().default('1'),
      width: z.number().default(1.5),
      height: z.number().optional(),
      rotation: z.number().default(0),
      netName: z.string().optional(),
      holeDiameter: z.number().optional(),
      padShape: z.array(z.any()).optional(),
      hole: z.array(z.any()).optional(),
      confirmWrite: z.literal(true),
    }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as Record<string, unknown>;
      return bridgeWrite(ctx, 'pcb.addPad', {
        x: p.x,
        y: p.y,
        layer: p.layer,
        padNumber: p.padNumber,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
        netName: p.netName,
        holeDiameter: p.holeDiameter,
        padShape: p.padShape,
        hole: p.hole,
      });
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_hole',
    title: 'Add PCB hole (NPTH / plated mounting hole)',
    description:
      'Add a non-plated (NPTH) tooling/mounting hole or a plated mounting hole. Implemented as a pad on the MULTI layer with a hole; plated=false yields NPTH, plated=true a plated hole.',
    profile: 'full',
    evidence: ['inferred'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      holeDiameter: z.number(),
      diameter: z.number().optional(),
      padNumber: z.string().default('1'),
      plated: z.boolean().default(false),
      confirmWrite: z.literal(true),
    }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as Record<string, unknown>;
      return bridgeWrite(ctx, 'pcb.addHole', {
        x: p.x,
        y: p.y,
        holeDiameter: p.holeDiameter,
        diameter: p.diameter,
        padNumber: p.padNumber,
        plated: p.plated,
      });
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_silkscreen_text',
    title: 'Add silkscreen text',
    description:
      'Place silkscreen/document-layer text via PCB_PrimitiveString.create (a controlled write). layer 3=top silk, 4=bottom silk, 13=document. alignMode 1..9 (5=center). fontFamily must be pre-imported. Use frame="bottom-view" for bottom-layer text whose rotation was computed in the top-plane frame.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.1.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      text: z.string(),
      layer: z.number().default(3),
      fontFamily: z.string().optional(),
      fontSize: z.number().default(1),
      lineWidth: z.number().default(0.15),
      alignMode: z.number().default(5),
      rotation: z.number().default(0),
      frame: z
        .enum(['stored', 'bottom-view'])
        .default('stored')
        .describe(
          'Rotation frame. "stored" (default): use rotation verbatim. "bottom-view": reflect the rotation (360-r, normalized to 0..360) so text authored in the top-plane frame reads correctly on the flipped bottom view. Applies only to bottom-side layers (2/4/6/8/10/59); no-op on top-side layers.',
        ),
      reverse: z.boolean().default(false),
      expansion: z.number().default(0),
      mirror: z.boolean().default(false),
      confirmWrite: z.literal(true),
    }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as Record<string, unknown>;
      const rotation = resolveSilkscreenRotation(
        p.rotation as number,
        p.layer as number,
        p.frame as 'stored' | 'bottom-view',
      );
      return bridgeWrite(ctx, 'pcb.addSilkText', {
        x: p.x,
        y: p.y,
        text: p.text,
        layer: p.layer,
        fontFamily: p.fontFamily,
        fontSize: p.fontSize,
        lineWidth: p.lineWidth,
        alignMode: p.alignMode,
        rotation,
        reverse: p.reverse,
        expansion: p.expansion,
        mirror: p.mirror,
      });
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_silkscreen_line',
    title: 'Add silkscreen line/path',
    description:
      'Draw silkscreen artwork (logos, outlines, glyphs) as connected line segments via PCB_PrimitiveLine on layer 3 (top) or 4 (bottom). Provide a points polyline.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
      layer: z.number().default(3),
      lineWidth: z.number().default(0.15),
      confirmWrite: z.literal(true),
    }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        points: Array<{ x: number; y: number }>;
        layer?: number;
        lineWidth?: number;
      };
      return bridgeWrite(ctx, 'pcb.addSilkLine', {
        points: flattenPoints(p.points),
        layer: p.layer ?? 3,
        lineWidth: p.lineWidth ?? 0.15,
      });
    },
  });

  registry.register({
    name: 'easyeda_pcb_add_solid_region',
    title: 'Add PCB solid fill region',
    description:
      'Author a solid copper (or other-layer) fill region via PCB_PrimitiveFill.create. shape="polygon" (points), "rect" (x,y,width,height), or "circle" (cx,cy,radius). Tie to a net with netName.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      layer: z.number().default(1),
      shape: z.enum(['polygon', 'rect', 'circle']).default('polygon'),
      points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      cx: z.number().optional(),
      cy: z.number().optional(),
      radius: z.number().optional(),
      netName: z.string().optional(),
      confirmWrite: z.literal(true),
    }),
    outputSchema: pcbWriteOutputSchema,
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        layer?: number;
        shape?: string;
        points?: Array<{ x: number; y: number }>;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        cx?: number;
        cy?: number;
        radius?: number;
        netName?: string;
      };
      const bp: Record<string, unknown> = {
        layer: p.layer ?? 1,
        shape: p.shape ?? 'polygon',
        netName: p.netName,
      };
      const pts = flattenPoints(p.points);
      if (pts) bp.points = pts;
      for (const k of ['x', 'y', 'width', 'height', 'cx', 'cy', 'radius'] as const) {
        if (p[k] !== undefined) bp[k] = p[k];
      }
      return bridgeWrite(ctx, 'pcb.addSolidRegion', bp);
    },
  });

  registry.register({
    name: 'easyeda_pcb_import_project_file',
    title: 'Import external board file into EasyEDA project',
    description:
      'Import (writes into the project) a KiCad/Altium/EAGLE/OrCAD/PADS/LTspice file into the current or existing EasyEDA Pro project via SYS_FileManager.importProjectByProjectFile. Desktop client only; needs external-interaction permission. filePath = absolute local path (KiCad .zip preferred for fileType "KiCad").',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      filePath: z.string(),
      fileType: z.string().default('KiCad'),
      existingProjectUuid: z.string().optional(),
      importOption: z.string().optional(),
      associateFootprint: z.boolean().optional(),
      associate3DModel: z.boolean().optional(),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      result: z.unknown().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        filePath: string;
        fileType?: string;
        existingProjectUuid?: string;
        importOption?: string;
        associateFootprint?: boolean;
        associate3DModel?: boolean;
      };
      const props: Record<string, unknown> = {};
      if (p.importOption !== undefined) props.importOption = p.importOption;
      if (p.associateFootprint !== undefined) props.associateFootprint = p.associateFootprint;
      if (p.associate3DModel !== undefined) props.associate3DModel = p.associate3DModel;
      const bp: Record<string, unknown> = {
        filePath: p.filePath,
        fileType: p.fileType ?? 'KiCad',
        existingProjectUuid: p.existingProjectUuid,
      };
      if (Object.keys(props).length > 0) bp.props = props;
      const res = await bridgeWrite(ctx, 'pcb.importProjectFile', bp);
      return { success: res.success, result: res.result, error: res.error };
    },
  });

  registry.register({
    name: 'easyeda_pcb_import_ses_route',
    title: 'Import Freerouting SES route',
    description:
      'Apply a Specctra SES (autorouter session) file — writes the routes onto the OPEN PCB via PCB_Document.importAutoRouteSesFile — the Freerouting round-trip. The board must already have components, nets, and outline. filePath must be absolute.',
    profile: 'full',
    evidence: ['official-docs'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      filePath: z.string(),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      result: z.unknown().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as { filePath: string };
      const res = await bridgeWrite(ctx, 'pcb.importSesRoute', { filePath: p.filePath });
      return { success: res.success, result: res.result, error: res.error };
    },
  });

  registry.register({
    name: 'easyeda_pcb_import_tscircuit_board',
    title: 'Build a tscircuit board and import it into EasyEDA',
    description:
      'Whole-board fallback: exports a tscircuit board to a patched KiCad archive (scripts/patch-kicad-cutouts.js = tsci export -f kicad_zip + cutout/soldermask patch), then imports it into the EasyEDA project via the bridge. Desktop client + external-interaction permission. skipBuild=true imports a pre-built zip.',
    profile: 'full',
    evidence: ['inferred'],
    risk: 'high',
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: z.object({
      board: z.enum(['top', 'middle', 'bottom']),
      tscircuitDir: z.string().default('TSCIRCUIT_PROJECT_DIR'),
      existingProjectUuid: z.string().optional(),
      zipPath: z.string().optional(),
      skipBuild: z.boolean().default(false),
      confirmWrite: z.literal(true),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      zipPath: z.string().optional(),
      buildLog: z.string().optional(),
      result: z.unknown().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const p = params as {
        board: 'top' | 'middle' | 'bottom';
        tscircuitDir: string;
        existingProjectUuid?: string;
        zipPath?: string;
        skipBuild?: boolean;
      };
      const zipPath =
        p.zipPath ?? path.join(os.homedir(), 'Downloads', 'Maker Chip', `${p.board}.kicad.zip`);
      let buildLog: string | undefined;
      if (!p.skipBuild) {
        try {
          const { stdout, stderr } = await execFileAsync(
            'node',
            ['scripts/patch-kicad-cutouts.js', p.board],
            { cwd: p.tscircuitDir, timeout: 300_000, maxBuffer: 32 * 1024 * 1024 },
          );
          buildLog = `${stdout}\n${stderr}`.trim();
        } catch (err) {
          const e = err as { stdout?: string; stderr?: string; message?: string };
          return {
            success: false,
            zipPath,
            buildLog: `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() || undefined,
            error: `tscircuit build failed: ${e.message ?? String(err)}`,
          };
        }
      }
      const res = await bridgeWrite(ctx, 'pcb.importProjectFile', {
        filePath: zipPath,
        fileType: 'KiCad',
        existingProjectUuid: p.existingProjectUuid,
      });
      return {
        success: res.success,
        zipPath,
        buildLog,
        result: res.result,
        error: res.error,
      };
    },
  });
}

export { registerPcbWriteTools };
