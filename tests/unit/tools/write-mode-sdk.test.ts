import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';

// Regression guard for the "preview executes the real write" bug.
//
// The registry unit tests invoke the captured handler directly, which bypasses
// the MCP SDK's input validation. But in production the SDK validates arguments
// against the REGISTERED input schema and strips any undeclared key BEFORE the
// registry wrapper runs. writeMode is not part of a tool's own inputSchema, so
// without registeredInputSchema() adding it, the SDK dropped writeMode and every
// writeMode="preview"/"plan" call silently fell through to a real apply.
//
// These tests drive an actual McpServer over an in-memory transport so the real
// SDK validation is in the path.

function mockContext(): ToolContext {
  return {
    profile: 'core',
    bridge: { connected: true, call: vi.fn() },
    config: { bridgeTimeoutMs: 1000, artifactDir: '.easyeda-mcp-pro/artifacts' },
    vendors: { lcsc: null, jlcpcb: null, mouser: null, digikey: null },
  } as unknown as ToolContext;
}

async function connectedClient(register: (registry: ToolRegistry, ctx: ToolContext) => void) {
  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  const registry = new ToolRegistry();
  const ctx = mockContext();
  register(registry, ctx);
  registry.registerAllOnServer(server as never, ctx);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function makeWriteTool(handler: () => Promise<unknown>) {
  return {
    name: 'test_write',
    title: 'test write',
    description: 'mutating test tool',
    profile: 'core' as const,
    evidence: ['inferred'] as const,
    risk: 'high' as const,
    confirmWrite: true,
    group: 'pcb-write',
    version: '1.0.0',
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: z.object({ name: z.string(), confirmWrite: z.literal(true) }),
    outputSchema: z.object({ ok: z.boolean(), written: z.boolean() }),
    handler,
  };
}

describe('writeMode through the real MCP SDK', () => {
  it('writeMode="preview" does NOT execute the handler (no real write)', async () => {
    const handler = vi.fn(async () => ({ ok: true, written: true }));
    const { client } = await connectedClient((registry, _ctx) => {
      registry.register(makeWriteTool(handler));
    });

    const res = await client.callTool({
      name: 'test_write',
      arguments: { name: 'R1', writeMode: 'preview', confirmWrite: true },
    });

    expect(handler).not.toHaveBeenCalled();
    expect(res.isError).toBeFalsy();
    const structured = res.structuredContent as {
      success?: boolean;
      transaction?: { phase?: string };
    };
    expect(structured.success).toBe(true);
    expect(structured.transaction?.phase).toBe('preview');
  });

  it('writeMode="apply" (default) with confirmWrite executes the handler', async () => {
    const handler = vi.fn(async () => ({ ok: true, written: true }));
    const { client } = await connectedClient((registry, _ctx) => {
      registry.register(makeWriteTool(handler));
    });

    const res = await client.callTool({
      name: 'test_write',
      arguments: { name: 'R1', confirmWrite: true },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ ok: true, written: true });
  });

  it('registers a write tool whose inputSchema has a refinement (zod v4 safeExtend)', async () => {
    // Regression: registeredInputSchema() overwrites the confirmWrite key, which
    // zod v4 ZodObject.extend() forbids on a schema carrying a .superRefine().
    // That threw at registration and crashed the whole server on startup
    // (-32000 Connection closed) at any profile registering such a tool.
    const handler = vi.fn(async () => ({ ok: true, written: true }));
    const refinedTool = {
      name: 'test_refined_write',
      title: 'refined write',
      description: 'mutating test tool with a superRefine',
      profile: 'core' as const,
      evidence: ['inferred'] as const,
      risk: 'high' as const,
      confirmWrite: true,
      group: 'pcb-write',
      version: '1.0.0',
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: z
        .object({ shape: z.enum(['rect', 'circle']), radius: z.number().optional(), confirmWrite: z.literal(true) })
        .superRefine((val, ctx) => {
          if (val.shape === 'circle' && val.radius === undefined) {
            ctx.addIssue({ code: 'custom', message: 'circle requires radius', path: ['radius'] });
          }
        }),
      outputSchema: z.object({ ok: z.boolean(), written: z.boolean() }),
      handler,
    };

    // The crash was at registration time; reaching a connected client proves it registered.
    const { client } = await connectedClient((registry) => {
      registry.register(refinedTool);
    });
    const res = await client.callTool({
      name: 'test_refined_write',
      arguments: { shape: 'rect', confirmWrite: true },
    });
    expect(res.isError).toBeFalsy();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('apply without confirmWrite is rejected and never runs the handler', async () => {
    const handler = vi.fn(async () => ({ ok: true, written: true }));
    const { client } = await connectedClient((registry, _ctx) => {
      registry.register(makeWriteTool(handler));
    });

    const res = await client.callTool({ name: 'test_write', arguments: { name: 'R1' } });

    expect(handler).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text?: string }>)[0]?.text ?? '';
    expect(text).toContain('ERR_CONFIRM_WRITE_REQUIRED');
  });
});
