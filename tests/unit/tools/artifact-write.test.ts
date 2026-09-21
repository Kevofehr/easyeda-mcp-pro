import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeArtifactFile, resolveArtifactPath } from '../../../src/tools/artifact-write.js';
import { type ToolContext } from '../../../src/tools/types.js';

describe('artifact-write', () => {
  let tmpArtifactDir: string;
  let ctx: ToolContext;

  beforeEach(() => {
    tmpArtifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-write-'));
    ctx = { config: { artifactDir: tmpArtifactDir } } as unknown as ToolContext;
  });

  afterEach(() => {
    fs.rmSync(tmpArtifactDir, { recursive: true, force: true });
  });

  it('writes the buffer and reports the on-disk byte length', () => {
    const target = path.join(tmpArtifactDir, 'out.txt');
    const result = writeArtifactFile(ctx, Buffer.from('hello', 'utf-8'), target, 'default.txt');

    expect(result.ok).toBe(true);
    expect(result.filePath).toBe(path.resolve(target));
    expect(result.byteLength).toBe(5);
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('falls back to the default file name inside the artifact directory', () => {
    const result = writeArtifactFile(ctx, Buffer.from('x', 'utf-8'), undefined, 'default.txt');

    expect(result.ok).toBe(true);
    expect(result.filePath).toBe(path.resolve(tmpArtifactDir, 'default.txt'));
  });

  it('refuses a target outside the artifact directory without writing it', () => {
    const outside = path.join(os.tmpdir(), 'artifact-write-outside.txt');
    const result = writeArtifactFile(ctx, Buffer.from('x', 'utf-8'), outside, 'default.txt');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/inside the artifact directory/i);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('never reports success for a zero-byte write', () => {
    const target = path.join(tmpArtifactDir, 'empty.bin');
    const result = writeArtifactFile(ctx, Buffer.alloc(0), target, 'default.bin');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('resolveArtifactPath validates without touching the filesystem', () => {
    const inside = resolveArtifactPath(ctx, path.join(tmpArtifactDir, 'a.txt'), 'd.txt');
    expect(inside.ok).toBe(true);

    const outside = resolveArtifactPath(ctx, path.join(os.tmpdir(), 'b.txt'), 'd.txt');
    expect(outside.ok).toBe(false);
    expect(fs.readdirSync(tmpArtifactDir)).toHaveLength(0);
  });
});
