import { z } from 'zod';
import { type ToolContext } from './types.js';

/**
 * Focus-lock: the core of headless multi-tab editing.
 *
 * EasyEDA Pro's edit APIs (sch_Document / pcb_Document / *_Primitive*) act on the
 * single "currently active document" - they are NOT tab-addressable. There is also
 * exactly one bridge connection per server. So to edit a specific tab without the
 * user clicking it, the server must: acquire a lock, activate the target tab, run
 * the edit against the now-active doc, then release. This module provides that.
 *
 * Because there is one server process driving one connection, a module-level mutex
 * correctly serializes every document-targeted edit across all concurrent tool
 * calls. Parallel edit *requests* are accepted; they execute one at a time.
 */

/** Shared target schema: name a document by tabId, uuid, or human name.
 *  Lives here (focus-lock only imports types) so both the editor tools and the
 *  registry/transaction retrofit can use it without an import cycle. */
export const documentTargetSchema = z
  .object({
    tabId: z.string().optional(),
    uuid: z.string().optional(),
    name: z.string().optional(),
  })
  .describe(
    'Optional: which document this edit targets. Provide one of tabId (from editor tools), uuid (schematic PAGE / PCB / panel uuid), or name (as shown in the project). When set, the server focuses that tab before applying the edit. When omitted, the edit applies to whatever document is currently active.',
  );

/** How a caller names the document to act on. Provide exactly one of these. */
export type DocumentTarget = z.infer<typeof documentTargetSchema>;

/** Default settle delay (ms) after activateDocument before running the edit.
 *  Conservative until VERIFY-3 measures the real value on a live build. */
const DEFAULT_ACTIVATE_SETTLE_MS = 150;

// Module-level serializer. One server = one connection = one active doc, so this
// single chain is the correct granularity.
let mutexChain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutexChain.then(() => fn());
  // Keep the chain alive regardless of this task's success/failure.
  mutexChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the target names no document at all (caller wants "whatever is active"). */
export function isEmptyTarget(target: DocumentTarget | undefined | null): boolean {
  return !target || (!target.tabId && !target.uuid && !target.name);
}

interface ProjectDoc {
  kind: 'schematic-page' | 'pcb' | 'panel';
  uuid: string;
  name: string;
}

/** Walk DMT_Project.getCurrentProjectInfo().data into a flat, openable-doc list. */
export function flattenProjectDocs(projectInfo: unknown): ProjectDoc[] {
  const out: ProjectDoc[] = [];
  const data =
    projectInfo && typeof projectInfo === 'object'
      ? (projectInfo as { data?: unknown }).data
      : undefined;
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const itemType = String(rec.itemType ?? '');
    // Schematics expose openable sheet PAGES (page uuid is what openDocument wants).
    if (itemType.includes('Schematic') && Array.isArray(rec.page)) {
      for (const page of rec.page) {
        if (page && typeof page === 'object') {
          const p = page as Record<string, unknown>;
          if (typeof p.uuid === 'string') {
            out.push({ kind: 'schematic-page', uuid: p.uuid, name: String(p.name ?? p.uuid) });
          }
        }
      }
    } else if (itemType === 'PCB' && typeof rec.uuid === 'string') {
      out.push({ kind: 'pcb', uuid: rec.uuid, name: String(rec.name ?? rec.uuid) });
    } else if (itemType === 'Panel' && typeof rec.uuid === 'string') {
      out.push({ kind: 'panel', uuid: rec.uuid, name: String(rec.name ?? rec.uuid) });
    }
  }
  return out;
}

/** Resolve a document name to an openable uuid via the live project tree. */
async function resolveNameToUuid(ctx: ToolContext, name: string): Promise<string> {
  const info = await ctx.bridge.call<Record<string, never>, unknown>('project.getInfo', {});
  const docs = flattenProjectDocs(info);
  const exact = docs.find((d) => d.name === name);
  const ci = exact ?? docs.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (!ci) {
    const available = docs.map((d) => `${d.name} (${d.kind})`).join(', ');
    throw new Error(
      `No open-able document named "${name}" in the current project. Available: ${available || '(none)'}`,
    );
  }
  return ci.uuid;
}

/**
 * Resolve a DocumentTarget to a concrete tabId, opening the document if needed.
 * name -> uuid (via project tree) -> openDocument -> tabId. uuid -> openDocument
 * (idempotent: opening an already-open doc returns its existing tabId).
 */
export async function resolveTargetToTabId(
  ctx: ToolContext,
  target: DocumentTarget,
): Promise<string> {
  if (target.tabId) return target.tabId;
  const uuid = target.uuid ?? (target.name ? await resolveNameToUuid(ctx, target.name) : undefined);
  if (!uuid) throw new Error('DocumentTarget requires one of tabId, uuid, or name.');
  const res = await ctx.bridge.call<{ documentUuid: string }, { tabId?: string }>(
    'editor.openDocument',
    { documentUuid: uuid },
  );
  if (!res?.tabId) throw new Error(`Failed to open document ${uuid}.`);
  return res.tabId;
}

/**
 * Serialize on the single active document: activate `target`'s tab, let it settle,
 * then run `fn` (the actual edit) against the now-active document. If `target` is
 * empty, `fn` runs against whatever is already active (legacy behavior) but still
 * under the lock so it cannot interleave with a targeted edit.
 */
export function withActiveDocument<T>(
  ctx: ToolContext,
  target: DocumentTarget | undefined | null,
  fn: () => Promise<T>,
  opts?: { settleMs?: number },
): Promise<T> {
  return runExclusive(async () => {
    if (!isEmptyTarget(target)) {
      const tabId = await resolveTargetToTabId(ctx, target as DocumentTarget);
      await ctx.bridge.call<{ tabId: string }, { ok: boolean }>('editor.activateDocument', {
        tabId,
      });
      await delay(opts?.settleMs ?? DEFAULT_ACTIVATE_SETTLE_MS);
    }
    return fn();
  });
}
