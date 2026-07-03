import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionSourcePath = join(process.cwd(), 'easyeda-bridge-extension', 'src', 'index.ts');

async function readExtensionSource(): Promise<string> {
  return readFile(extensionSourcePath, 'utf8');
}

describe('bridge extension runtime compatibility guards', () => {
  it('keeps the EasyEDA register open fallback for v3 connectedCallFn gaps', async () => {
    const source = await readExtensionSource();

    // This fork keeps a src-labeled fireOpen (emits "open via connectedCallFn" /
    // "open via fallback-timer" diagnostics) — functionally the same v3 fallback
    // fix, using the same constant.
    expect(source).toContain('EASYEDA_REGISTER_OPEN_FALLBACK_MS');
    expect(source).toContain('const fireOpen = (src: string): void =>');
    expect(source).toContain(
      "setTimeout(() => fireOpen('fallback-timer'), EASYEDA_REGISTER_OPEN_FALLBACK_MS);",
    );
  });

  it('surfaces the External Interactions permission hint when register throws', async () => {
    const source = await readExtensionSource();

    expect(source).toContain('showExternalInteractionHintOnce');
    expect(source).toContain('External Interactions permission');
    expect(source).toContain('showToast(message);');
  });
});
