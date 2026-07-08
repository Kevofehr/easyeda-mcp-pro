import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';
import { registerEditorTools } from '../../../src/tools/L1_editor.js';
import {
  flattenProjectDocs,
  withActiveDocument,
  isEmptyTarget,
} from '../../../src/tools/focus-lock.js';
import { EnvSchema } from '../../../src/config/env.js';

const PROJECT_INFO = {
  uuid: 'proj-1',
  friendlyName: 'Demo Board',
  data: [
    {
      itemType: 'Schematic',
      uuid: 'sch-1',
      name: 'Main Schematic',
      page: [
        { itemType: 'Schematic Page', uuid: 'page-1', name: 'Power' },
        { itemType: 'Schematic Page', uuid: 'page-2', name: 'MCU' },
      ],
    },
    { itemType: 'PCB', uuid: 'pcb-1', name: 'Main PCB' },
    { itemType: 'Panel', uuid: 'panel-1', name: 'Panel A' },
  ],
};

function makeContext(bridgeCall: (m: string, p?: unknown, o?: unknown) => Promise<unknown>) {
  return {
    profile: 'full',
    bridge: { connected: true, call: bridgeCall },
    config: {
      bridgeTimeoutMs: 1000,
      artifactDir: '.easyeda-mcp-pro/artifacts',
      bridgeHost: '127.0.0.1',
      bridgePort: 49620,
    },
    vendors: { lcsc: null, jlcpcb: null, mouser: null, digikey: null },
  } as unknown as ToolContext;
}

describe('focus-lock helpers', () => {
  it('flattenProjectDocs expands schematic pages, pcbs, and panels', () => {
    const docs = flattenProjectDocs(PROJECT_INFO);
    expect(docs).toEqual([
      { kind: 'schematic-page', uuid: 'page-1', name: 'Power' },
      { kind: 'schematic-page', uuid: 'page-2', name: 'MCU' },
      { kind: 'pcb', uuid: 'pcb-1', name: 'Main PCB' },
      { kind: 'panel', uuid: 'panel-1', name: 'Panel A' },
    ]);
  });

  it('isEmptyTarget detects "no target"', () => {
    expect(isEmptyTarget(undefined)).toBe(true);
    expect(isEmptyTarget({})).toBe(true);
    expect(isEmptyTarget({ name: 'x' })).toBe(false);
  });

  it('withActiveDocument serializes concurrent targeted edits (no interleave)', async () => {
    const order: string[] = [];
    const bridgeCall = vi.fn(async (method: string, params: unknown) => {
      if (method === 'editor.openDocument') {
        const uuid = (params as { documentUuid: string }).documentUuid;
        return { tabId: `tab-${uuid}` };
      }
      if (method === 'editor.activateDocument') {
        order.push(`activate:${(params as { tabId: string }).tabId}`);
        return { ok: true };
      }
      return {};
    });
    const ctx = makeContext(bridgeCall);

    const editA = withActiveDocument(
      ctx,
      { uuid: 'A' },
      async () => {
        order.push('edit:A-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('edit:A-end');
      },
      { settleMs: 0 },
    );
    const editB = withActiveDocument(
      ctx,
      { uuid: 'B' },
      async () => {
        order.push('edit:B-start');
        order.push('edit:B-end');
      },
      { settleMs: 0 },
    );
    await Promise.all([editA, editB]);

    // A must fully complete (activate -> edit start -> edit end) before B activates.
    expect(order).toEqual([
      'activate:tab-A',
      'edit:A-start',
      'edit:A-end',
      'activate:tab-B',
      'edit:B-start',
      'edit:B-end',
    ]);
  });

  it('withActiveDocument runs fn without activation when target is empty', async () => {
    const bridgeCall = vi.fn(async () => ({}));
    const ctx = makeContext(bridgeCall);
    let ran = false;
    await withActiveDocument(ctx, undefined, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(bridgeCall).not.toHaveBeenCalledWith('editor.activateDocument', expect.anything());
  });
});

describe('editor tools', () => {
  let registry: ToolRegistry;
  let bridgeCall: ReturnType<
    typeof vi.fn<(method: string, params?: unknown, opts?: unknown) => Promise<unknown>>
  >;
  let context: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    const config = EnvSchema.parse({ NODE_ENV: 'test' });
    registerEditorTools(registry, config);
    bridgeCall = vi.fn();
    context = makeContext(bridgeCall) as ToolContext;
  });

  it('easyeda_project_documents flattens the project tree', async () => {
    bridgeCall.mockResolvedValue(PROJECT_INFO);
    const tool = registry.get('easyeda_project_documents');
    const result = (await tool?.handler(context, {})) as {
      ok: boolean;
      count: number;
      project?: { name?: string };
    };
    expect(bridgeCall).toHaveBeenCalledWith('project.getInfo', {});
    expect(result.ok).toBe(true);
    expect(result.count).toBe(4);
    expect(result.project?.name).toBe('Demo Board');
  });

  it('easyeda_editor_list_tabs returns tabs', async () => {
    bridgeCall.mockResolvedValue({
      tabs: [{ tabId: 't1', title: 'Power', documentType: 1, splitScreenId: 's1' }],
    });
    const tool = registry.get('easyeda_editor_list_tabs');
    const result = (await tool?.handler(context, {})) as { ok: boolean; count: number };
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });

  it('easyeda_editor_open resolves a name and activates', async () => {
    bridgeCall.mockImplementation(async (method: string) => {
      if (method === 'project.getInfo') return PROJECT_INFO;
      if (method === 'editor.openDocument') return { tabId: 'tab-page-2' };
      if (method === 'editor.activateDocument') return { ok: true };
      return {};
    });
    const tool = registry.get('easyeda_editor_open');
    const result = (await tool?.handler(context, { name: 'MCU', activate: true })) as {
      ok: boolean;
      tabId?: string;
      activated?: boolean;
    };
    expect(result.ok).toBe(true);
    expect(result.tabId).toBe('tab-page-2');
    expect(result.activated).toBe(true);
    expect(bridgeCall).toHaveBeenCalledWith('editor.openDocument', { documentUuid: 'page-2' });
  });

  it('easyeda_editor_open errors on unknown name', async () => {
    bridgeCall.mockImplementation(async (method: string) => {
      if (method === 'project.getInfo') return PROJECT_INFO;
      return {};
    });
    const tool = registry.get('easyeda_editor_open');
    const result = (await tool?.handler(context, { name: 'Nope' })) as {
      ok: boolean;
      error?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nope');
  });

  it('easyeda_editor_screenshot returns image payload', async () => {
    bridgeCall.mockResolvedValue({ imageBase64: 'QUJD', mime: 'image/png', bytes: 3 });
    const tool = registry.get('easyeda_editor_screenshot');
    const result = (await tool?.handler(context, { tabId: 't1' })) as {
      ok: boolean;
      imageBase64?: string;
      mime?: string;
    };
    expect(bridgeCall).toHaveBeenCalledWith('editor.screenshot', { tabId: 't1' });
    expect(result.ok).toBe(true);
    expect(result.imageBase64).toBe('QUJD');
    expect(result.mime).toBe('image/png');
  });

  it('easyeda_editor_screenshot degrades to not_available and surfaces diagnostics', async () => {
    bridgeCall.mockResolvedValue({
      not_available: true,
      reason: 'no canvas focused',
      attempts: [{ tabId: null, returned: 'undefined' }],
      canvasTabs: [],
    });
    const tool = registry.get('easyeda_editor_screenshot');
    const result = (await tool?.handler(context, {})) as {
      ok: boolean;
      not_available?: boolean;
      reason?: string;
      attempts?: unknown[];
    };
    expect(result.ok).toBe(false);
    expect(result.not_available).toBe(true);
    expect(result.reason).toBe('no canvas focused');
    expect(result.attempts).toHaveLength(1);
  });

  it('easyeda_editor_close closes by tabId', async () => {
    bridgeCall.mockResolvedValue({ ok: true });
    const tool = registry.get('easyeda_editor_close');
    const result = (await tool?.handler(context, { tabId: 't1', confirmWrite: true })) as {
      ok: boolean;
    };
    expect(bridgeCall).toHaveBeenCalledWith('editor.closeDocument', { tabId: 't1' });
    expect(result.ok).toBe(true);
  });
});
