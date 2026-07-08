import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from './types.js';
import { type EnvConfig } from '../config/env.js';
import {
  flattenProjectDocs,
  resolveTargetToTabId,
  documentTargetSchema,
  type DocumentTarget,
} from './focus-lock.js';

/**
 * Headless editor / tab orchestration tools (plan section 2.2).
 *
 * These let a single agent navigate the whole EasyEDA project - enumerate docs,
 * list/open/activate/close tabs, and screenshot any tab - without the user
 * focusing anything manually. They wrap eda.dmt_EditorControl / dmt_Project via
 * typed bridge methods (no raw JS execution).
 */

/** Re-exported so callers importing from the editor module still resolve it. */
export { documentTargetSchema };

const documentSchema = z.object({
  kind: z.enum(['schematic-page', 'pcb', 'panel']),
  uuid: z.string(),
  name: z.string(),
});

const tabSchema = z.object({
  tabId: z.string(),
  title: z.string().optional(),
  documentType: z.union([z.number(), z.string()]).optional(),
  splitScreenId: z.string().optional(),
});

export function registerEditorTools(
  registry: { register: (def: ToolDefinition) => void },
  _config: EnvConfig,
): void {
  // ── easyeda_project_documents ─────────────────────────────────────────────
  registry.register({
    name: 'easyeda_project_documents',
    title: 'List project documents',
    description:
      'Enumerate every openable document in the currently-open EasyEDA project: schematic sheet pages, PCBs, and panels, each with its uuid, name, and kind. Use the uuid or name with easyeda_editor_open / easyeda_editor_activate, or as the `document` target on write tools.',
    profile: 'core',
    evidence: ['pro-api-types'],
    risk: 'low',
    confirmWrite: false,
    group: 'editor',
    version: '1.0.0',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: z.object({}),
    outputSchema: z.object({
      ok: z.boolean(),
      project: z.object({ uuid: z.string().optional(), name: z.string().optional() }).optional(),
      documents: z.array(documentSchema),
      count: z.number().int().nonnegative(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext) => {
      try {
        const info = await ctx.bridge.call<Record<string, never>, Record<string, unknown>>(
          'project.getInfo',
          {},
        );
        const documents = flattenProjectDocs(info);
        return {
          ok: true,
          project: {
            uuid: typeof info?.uuid === 'string' ? info.uuid : undefined,
            name: typeof info?.friendlyName === 'string' ? info.friendlyName : undefined,
          },
          documents,
          count: documents.length,
        };
      } catch (err) {
        return {
          ok: false,
          documents: [],
          count: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  // ── easyeda_editor_list_tabs ──────────────────────────────────────────────
  registry.register({
    name: 'easyeda_editor_list_tabs',
    title: 'List open editor tabs',
    description:
      'List the tabs currently open in the EasyEDA editor, including tabId, title, document type, and split-screen id. Reads across all split screens without changing focus.',
    profile: 'core',
    evidence: ['pro-api-types'],
    risk: 'low',
    confirmWrite: false,
    group: 'editor',
    version: '1.0.0',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: z.object({}),
    outputSchema: z.object({
      ok: z.boolean(),
      tabs: z.array(tabSchema),
      count: z.number().int().nonnegative(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext) => {
      try {
        const res = await ctx.bridge.call<Record<string, never>, { tabs?: unknown[] }>(
          'editor.listTabs',
          {},
        );
        const tabs = Array.isArray(res?.tabs) ? (res.tabs as z.infer<typeof tabSchema>[]) : [];
        return { ok: true, tabs, count: tabs.length };
      } catch (err) {
        return { ok: false, tabs: [], count: 0, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ── easyeda_editor_open ───────────────────────────────────────────────────
  registry.register({
    name: 'easyeda_editor_open',
    title: 'Open a document tab',
    description:
      'Open a schematic sheet page, PCB, or panel by uuid or name in the currently-open project, returning its tabId. Non-destructive: opening an already-open document returns its existing tab. Optionally activate (focus) it. The document must belong to the currently-open project.',
    profile: 'full',
    evidence: ['pro-api-types'],
    risk: 'low',
    confirmWrite: false,
    group: 'editor',
    version: '1.0.0',
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      uuid: z.string().optional(),
      name: z.string().optional(),
      activate: z.boolean().default(true),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      tabId: z.string().optional(),
      activated: z.boolean().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { uuid, name, activate } = z
        .object({
          uuid: z.string().optional(),
          name: z.string().optional(),
          activate: z.boolean().default(true),
        })
        .parse(params);
      if (!uuid && !name) {
        return { ok: false, error: 'Provide a uuid or a name to open.' };
      }
      try {
        const tabId = await resolveTargetToTabId(ctx, { uuid, name } as DocumentTarget);
        let activated = false;
        if (activate) {
          const a = await ctx.bridge.call<{ tabId: string }, { ok: boolean }>(
            'editor.activateDocument',
            { tabId },
          );
          activated = a?.ok === true;
        }
        return { ok: true, tabId, activated };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ── easyeda_editor_activate ───────────────────────────────────────────────
  registry.register({
    name: 'easyeda_editor_activate',
    title: 'Activate (focus) a tab',
    description:
      'Switch editor focus to a specific tab by tabId, or by document uuid/name (opening it first if needed). This is how the agent cycles between pages/boards. Focus is a prerequisite for editing that document.',
    profile: 'full',
    evidence: ['pro-api-types'],
    risk: 'low',
    confirmWrite: false,
    group: 'editor',
    version: '1.0.0',
    annotations: { readOnlyHint: false, idempotentHint: true },
    inputSchema: documentTargetSchema,
    outputSchema: z.object({
      ok: z.boolean(),
      tabId: z.string().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const target = documentTargetSchema.parse(params);
      if (!target.tabId && !target.uuid && !target.name) {
        return { ok: false, error: 'Provide a tabId, uuid, or name to activate.' };
      }
      try {
        const tabId = await resolveTargetToTabId(ctx, target);
        const a = await ctx.bridge.call<{ tabId: string }, { ok: boolean }>(
          'editor.activateDocument',
          { tabId },
        );
        return { ok: a?.ok === true, tabId };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ── easyeda_editor_close ──────────────────────────────────────────────────
  registry.register({
    name: 'easyeda_editor_close',
    title: 'Close a tab',
    description:
      'Close an editor tab by tabId. WARNING: closing a document with unsaved changes discards them - save first with easyeda_project_save / easyeda_pcb_document_save. Requires confirmWrite=true.',
    profile: 'full',
    evidence: ['pro-api-types'],
    risk: 'medium',
    confirmWrite: true,
    group: 'editor',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    inputSchema: z.object({ tabId: z.string(), confirmWrite: z.boolean().default(false) }),
    outputSchema: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { tabId } = z
        .object({ tabId: z.string(), confirmWrite: z.boolean().default(false) })
        .parse(params);
      try {
        const res = await ctx.bridge.call<{ tabId: string }, { ok: boolean }>(
          'editor.closeDocument',
          { tabId },
        );
        return { ok: res?.ok === true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ── easyeda_editor_screenshot ─────────────────────────────────────────────
  registry.register({
    name: 'easyeda_editor_screenshot',
    title: 'Screenshot a tab canvas',
    description:
      "Capture the rendered canvas of a tab as an image so the agent can visually inspect it. Pass a tabId to capture a specific (even non-focused) tab; omit it to capture the last-focused canvas. Returns an image content block. Uses a @beta EasyEDA API - if unavailable on the installed build it returns not_available=true.",
    profile: 'core',
    evidence: ['pro-api-types'],
    risk: 'low',
    confirmWrite: false,
    group: 'editor',
    version: '1.0.0',
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: z.object({ tabId: z.string().optional() }),
    outputSchema: z.object({
      ok: z.boolean(),
      imageBase64: z.string().optional(),
      mime: z.string().optional(),
      bytes: z.number().int().nonnegative().optional(),
      not_available: z.boolean().optional(),
      // Diagnostics surfaced when no image renders, so the cause is visible
      // (which tabIds were tried, what each call returned, the open canvas tabs).
      reason: z.string().optional(),
      attempts: z
        .array(z.object({ tabId: z.string().nullable(), returned: z.string() }))
        .optional(),
      canvasTabs: z.array(z.unknown()).optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { tabId } = z.object({ tabId: z.string().optional() }).parse(params);
      try {
        const res = await ctx.bridge.call<
          { tabId?: string },
          {
            imageBase64?: string;
            mime?: string;
            bytes?: number;
            not_available?: boolean;
            reason?: string;
            attempts?: Array<{ tabId: string | null; returned: string }>;
            canvasTabs?: unknown[];
          }
        >('editor.screenshot', { tabId });
        if (res?.not_available || !res?.imageBase64) {
          return {
            ok: false,
            not_available: true,
            reason: res?.reason,
            attempts: res?.attempts,
            canvasTabs: res?.canvasTabs,
          };
        }
        return {
          ok: true,
          imageBase64: res.imageBase64,
          mime: res.mime ?? 'image/png',
          bytes: res.bytes,
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ── easyeda_editor_focus_document ─────────────────────────────────────────
  registry.register({
    name: 'easyeda_editor_focus_document',
    title: 'Focus a document (resolve + open + activate)',
    description:
      'One-shot convenience: resolve a document by uuid or name, open it if needed, and activate it - leaving it focused and ready to edit. Equivalent to easyeda_editor_open with activate=true, but accepts name resolution.',
    profile: 'full',
    evidence: ['pro-api-types'],
    risk: 'low',
    confirmWrite: false,
    group: 'editor',
    version: '1.0.0',
    annotations: { readOnlyHint: false, idempotentHint: true },
    inputSchema: documentTargetSchema,
    outputSchema: z.object({
      ok: z.boolean(),
      tabId: z.string().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const target = documentTargetSchema.parse(params);
      if (!target.tabId && !target.uuid && !target.name) {
        return { ok: false, error: 'Provide a tabId, uuid, or name to focus.' };
      }
      try {
        const tabId = await resolveTargetToTabId(ctx, target);
        const a = await ctx.bridge.call<{ tabId: string }, { ok: boolean }>(
          'editor.activateDocument',
          { tabId },
        );
        return { ok: a?.ok === true, tabId };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });
}
