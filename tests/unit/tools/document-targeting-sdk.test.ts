import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';

// Verifies the centralized document-targeting retrofit through the REAL MCP SDK:
// a write tool given `document: { name }` must have its tab focused (openDocument
// + activateDocument on the bridge) BEFORE the handler's own bridge call runs.
// Undeclared keys are stripped by the SDK before the registry wrapper, so this
// only works because registeredInputSchema() advertises `document`.

const PROJECT_INFO = {
  uuid: 'proj-1',
  friendlyName: 'Demo',
  data: [
    {
      itemType: 'Schematic',
      uuid: 'sch-1',
      name: 'Main',
      page: [{ itemType: 'Schematic Page', uuid: 'page-mcu', name: 'MCU' }],
    },
  ],
};

function mockContext(calls: string[]): ToolContext {
  const bridge = {
    connected: true,
    call: vi.fn(async (method: string, params?: unknown) => {
      calls.push(method);
      if (method === 'project.getInfo') return PROJECT_INFO;
      if (method === 'editor.openDocument') {
        return { tabId: `tab-${(params as { documentUuid: string }).documentUuid}` };
      }
      if (method === 'editor.activateDocument') return { ok: true };
      return { ok: true, applied: true };
    }),
  };
  return {
    profile: 'core',
    bridge,
    config: { bridgeTimeoutMs: 1000, artifactDir: '.easyeda-mcp-pro/artifacts' },
    vendors: { lcsc: null, jlcpcb: null, mouser: null, digikey: null },
  } as unknown as ToolContext;
}

async function connectedClient(register: (registry: ToolRegistry, ctx: ToolContext) => void) {
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  const registry = new ToolRegistry();
  const calls: string[] = [];
  const ctx = mockContext(calls);
  register(registry, ctx);
  registry.registerAllOnServer(server as never, ctx);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, calls };
}

function makeWriteTool(handler: (ctx: ToolContext) => Promise<unknown>) {
  return {
    name: 'test_targeted_write',
    title: 'targeted write',
    description: 'mutating test tool',
    profile: 'core' as const,
    evidence: ['inferred'] as const,
    risk: 'high' as const,
    confirmWrite: true,
    group: 'schematic',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: z.object({ ref: z.string(), confirmWrite: z.literal(true) }),
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (ctx: ToolContext) => handler(ctx),
  };
}

describe('document targeting through the real MCP SDK', () => {
  it('focuses the named tab before the write handler runs', async () => {
    const { client, calls } = await connectedClient((registry, _ctx) => {
      registry.register(
        makeWriteTool(async (ctx) => {
          await ctx.bridge.call('schematic.modifyPrimitive', {});
          return { ok: true };
        }),
      );
    });

    const res = await client.callTool({
      name: 'test_targeted_write',
      arguments: { ref: 'R1', confirmWrite: true, document: { name: 'MCU' } },
    });

    expect(res.isError).toBeFalsy();
    // Order proves the focus-lock resolved + activated the tab before the edit.
    expect(calls).toEqual([
      'project.getInfo',
      'editor.openDocument',
      'editor.activateDocument',
      'schematic.modifyPrimitive',
    ]);
  });

  it('runs the write with no focus calls when document is omitted', async () => {
    const { client, calls } = await connectedClient((registry, _ctx) => {
      registry.register(
        makeWriteTool(async (ctx) => {
          await ctx.bridge.call('schematic.modifyPrimitive', {});
          return { ok: true };
        }),
      );
    });

    const res = await client.callTool({
      name: 'test_targeted_write',
      arguments: { ref: 'R1', confirmWrite: true },
    });

    expect(res.isError).toBeFalsy();
    expect(calls).toEqual(['schematic.modifyPrimitive']);
  });
});
