import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolContext } from './types.js';

export interface WriteExportResult {
  ok: boolean;
  filePath?: string;
  byteLength?: number;
  error?: string;
}

/**
 * Write `buffer` to disk under `ctx.config.artifactDir`, refusing any target that
 * escapes that sandbox.
 *
 * This is the single place every artifact-producing tool (Gerbers, PDF, netlist,
 * pick-and-place, BOM) resolves and validates its output path, so the sandbox rule
 * and the "only report success once bytes are really on disk" rule cannot drift
 * apart between tools.
 *
 * `requestedPath` is resolved against the process CWD (matching the other
 * exporters) and must land inside `artifactDir`; when omitted, `defaultFileName`
 * is placed directly in `artifactDir`.
 */
export function resolveArtifactPath(
  ctx: ToolContext,
  requestedPath: string | undefined,
  defaultFileName: string,
): { ok: true; target: string } | { ok: false; error: string } {
  const artifactDir = path.resolve(ctx.config.artifactDir);
  const target = requestedPath
    ? path.resolve(requestedPath)
    : path.resolve(artifactDir, defaultFileName);
  const relative = path.relative(artifactDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, error: 'File path must be inside the artifact directory.' };
  }
  return { ok: true, target };
}

export function writeArtifactFile(
  ctx: ToolContext,
  buffer: Buffer,
  requestedPath: string | undefined,
  defaultFileName: string,
): WriteExportResult {
  const resolved = resolveArtifactPath(ctx, requestedPath, defaultFileName);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const target = resolved.target;

  const parentDir = path.dirname(target);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(target, buffer);

  // Never report success on a write we cannot confirm: re-stat the target and
  // require a non-empty regular file before the caller may say `exported: true`.
  let written: fs.Stats;
  try {
    written = fs.statSync(target);
  } catch (err) {
    return {
      ok: false,
      error: `Export file was not found after writing: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!written.isFile() || written.size === 0) {
    return { ok: false, error: 'Export file was empty after writing.' };
  }

  return { ok: true, filePath: target, byteLength: written.size };
}
