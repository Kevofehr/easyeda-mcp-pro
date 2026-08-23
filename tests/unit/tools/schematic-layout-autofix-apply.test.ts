import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvSchema } from '../../../src/config/env.js';
import { registerSchematicLayoutTools } from '../../../src/tools/L2_schematic_layout.js';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';

// A single component ('component-u1' / ref 'U1') placed inside the title
// block of a 1000x700 mil sheet -- buildEngineSheetGeometry's keepout there
// is {x: 550, y: -182, width: 450, height: 182} (see
// schematic-layout-autofix.test.ts for the derivation), so this component
// always yields exactly one TITLE_BLOCK_OVERLAP violation and one proposed
// position move.
const COMPONENT_ITEM = {
  primitiveId: 'component-u1',
  reference: 'U1',
  component_kind: 'part',
  x: 600,
  y: -100,
};
const BOUNDS_ITEM = {
  primitiveId: 'component-u1',
  bounds: { minX: 600, maxX: 640, minY: -100, maxY: -80 },
};

interface BridgeFixtureOptions {
  /** Every connectivity read taken after the first modifyPrimitive call reports the pin as disconnected. */
  breakConnectivityAfterWrite?: boolean;
}

function buildBridgeMock(options: BridgeFixtureOptions = {}) {
  // stableConnectivityRead (src/live/readback.ts) calls readConnectivity
  // repeatedly until two *consecutive* reads match, so the fixture must key
  // off whether a write has actually happened yet -- not off a raw call
  // counter -- otherwise the pre-write "before" checkpoint never stabilizes
  // on a single consistent value.
  let writeHappened = false;
  return vi.fn(async (method: string, params: any) => {
    switch (method) {
      case 'schematic.getSheetInfo':
        return { pageSize: { width: 1000, height: 700, unit: 'mil' } };
      case 'schematic.listComponents':
        return { total: 1, items: [COMPONENT_ITEM] };
      case 'schematic.primitiveBounds':
        return { items: [BOUNDS_ITEM] };
      case 'api.call':
        return { result: [{ pinNumber: '1', pinName: 'A', x: 600, y: -100, rotation: 0 }] };
      case 'schematic.listNets': {
        const disconnected = options.breakConnectivityAfterWrite && writeHappened;
        return disconnected ? [] : [{ netName: 'NET1', nodes: [{ component: 'U1', pin: '1' }] }];
      }
      case 'system.inspectWires':
        return { total: 0, samples: [] };
      case 'schematic.getPrimitiveSnapshot':
        return { primitiveId: params?.primitiveId, position: { x: 600, y: -100 } };
      case 'schematic.modifyPrimitive':
        writeHappened = true;
        return { ok: true };
      case 'schematic.restorePrimitiveSnapshot':
        return { ok: true };
      default:
        throw new Error(`Unexpected method ${method}`);
    }
  });
}

describe('easyeda_schematic_layout_autofix_apply', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registerSchematicLayoutTools(registry, EnvSchema.parse({ NODE_ENV: 'test' }));
  });

  function makeContext(bridgeCall: ReturnType<typeof buildBridgeMock>): ToolContext {
    return {
      profile: 'pro',
      bridge: { connected: true, call: bridgeCall },
      config: { bridgeTimeoutMs: 1000, artifactDir: '.easyeda-mcp-pro/artifacts' },
      vendors: { lcsc: null, jlcpcb: null, mouser: null, digikey: null },
    };
  }

  it('is registered as confirmWrite:true, high risk', () => {
    const tool = registry.get('easyeda_schematic_layout_autofix_apply');
    expect(tool?.confirmWrite).toBe(true);
    expect(tool?.risk).toBe('high');
  });

  it('rejects a call missing confirmWrite:true via the input schema', () => {
    const tool = registry.get('easyeda_schematic_layout_autofix_apply');
    const parsed = tool?.inputSchema?.safeParse({ projectId: 'project-1' });
    expect(parsed?.success).toBe(false);
  });

  it('dryRun:true computes the preview without opening a transaction or writing', async () => {
    const bridgeCall = buildBridgeMock();
    const result = await registry
      .get('easyeda_schematic_layout_autofix_apply')
      ?.handler(makeContext(bridgeCall), {
        projectId: 'project-dryrun',
        confirmWrite: true,
        dryRun: true,
      });

    expect(result).toMatchObject({
      dryRun: true,
      applied: false,
      batchesVerified: 0,
    });
    expect(result.violations).toHaveLength(1);
    expect(result.moves).toHaveLength(1);
    expect(bridgeCall).not.toHaveBeenCalledWith('schematic.modifyPrimitive', expect.anything());
    expect(bridgeCall).not.toHaveBeenCalledWith(
      'schematic.getPrimitiveSnapshot',
      expect.anything(),
    );
  });

  it('applies the move and commits when connectivity stays stable across the write batch', async () => {
    const bridgeCall = buildBridgeMock();
    const result = await registry
      .get('easyeda_schematic_layout_autofix_apply')
      ?.handler(makeContext(bridgeCall), {
        projectId: 'project-apply-stable',
        confirmWrite: true,
      });

    expect(result.applied).toBe(true);
    expect(result.batchesVerified).toBe(1);
    expect(result.report.fixed).toHaveLength(1);
    expect(result.report.remaining).toEqual([]);
    expect(result.transactionState).toBe('committed');
    expect(result.errorCode).toBeUndefined();
    expect(bridgeCall).toHaveBeenCalledWith(
      'schematic.modifyPrimitive',
      expect.objectContaining({ primitiveId: 'component-u1' }),
    );
    expect(bridgeCall).not.toHaveBeenCalledWith(
      'schematic.restorePrimitiveSnapshot',
      expect.anything(),
    );
  });

  it('rolls back and reports the failure when the move changes connectivity', async () => {
    const bridgeCall = buildBridgeMock({ breakConnectivityAfterWrite: true });
    const result = await registry
      .get('easyeda_schematic_layout_autofix_apply')
      ?.handler(makeContext(bridgeCall), {
        projectId: 'project-apply-rollback',
        confirmWrite: true,
      });

    expect(result.applied).toBe(false);
    expect(result.errorCode).toBe('AUTOFIX_ROLLED_BACK');
    expect(result.connectivityDiff?.equal).toBe(false);
    // Rollback means nothing was actually fixed, regardless of what the
    // pre-apply preview proposed.
    expect(result.report.fixed).toEqual([]);
    expect(bridgeCall).toHaveBeenCalledWith(
      'schematic.restorePrimitiveSnapshot',
      expect.anything(),
    );
  });

  it('reports zero moves as applied:false without any modifyPrimitive calls', async () => {
    // An allowlist that excludes 'component' primitives leaves the
    // TITLE_BLOCK_OVERLAP violation detected but unresolvable.
    const bridgeCall = buildBridgeMock();
    const result = await registry
      .get('easyeda_schematic_layout_autofix_apply')
      ?.handler(makeContext(bridgeCall), {
        projectId: 'project-apply-nomoves',
        confirmWrite: true,
        allowlist: { primitiveTypes: ['text'], properties: ['position'] },
      });

    expect(result.moves).toEqual([]);
    expect(result.applied).toBe(false);
    expect(bridgeCall).not.toHaveBeenCalledWith('schematic.modifyPrimitive', expect.anything());
  });
});
