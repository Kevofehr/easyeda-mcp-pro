import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CLIENT_NAME,
  BRIDGE_PROTOCOL,
  BridgeHandshakeSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../../../src/bridge/protocol.js';

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

  it('advertises an extension protocolVersion the server handshake schema accepts', async () => {
    const source = await readExtensionSource();
    const match = source.match(/const BRIDGE_VERSION = '([^']+)'/);
    expect(match, 'BRIDGE_VERSION const not found in extension source').not.toBeNull();
    const protocolVersion = match![1];

    // The extension's protocolVersion MUST be in the server's supported set, or
    // the server rejects the handshake with 4001 before ever sending 'hello' and
    // NO connection can be established. (This regressed once when BRIDGE_VERSION
    // was bumped to 1.1.0 without updating SUPPORTED_PROTOCOL_VERSIONS.)
    expect(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).toContain(protocolVersion);

    // And a real handshake carrying it must pass the server's schema.
    const parsed = BridgeHandshakeSchema.safeParse({
      type: 'handshake',
      protocol: BRIDGE_PROTOCOL,
      protocolVersion,
      clientName: BRIDGE_CLIENT_NAME,
      contractVersion: 1,
    });
    expect(parsed.success).toBe(true);
  });
});
