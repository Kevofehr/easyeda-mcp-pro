import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';
import { registerPcbWriteTools, resolveSilkscreenRotation } from '../../../src/tools/L1_pcb_write.js';
import { EnvSchema } from '../../../src/config/env.js';

describe('PCB Write Tools', () => {
  let registry: ToolRegistry;
  let context: ToolContext;
  let bridgeCall: any;

  beforeEach(() => {
    registry = new ToolRegistry();
    const config = EnvSchema.parse({ NODE_ENV: 'test' });
    registerPcbWriteTools(registry, config);

    bridgeCall = vi.fn();

    context = {
      profile: 'full',
      bridge: {
        connected: true,
        call: bridgeCall,
      },
      config: {
        bridgeTimeoutMs: 1000,
        artifactDir: '.easyeda-mcp-pro/artifacts',
      },
      vendors: {
        lcsc: null,
        jlcpcb: null,
        mouser: null,
        digikey: null,
      },
    };
  });

  it('should register all 6 PCB write tools', () => {
    expect(registry.get('easyeda_pcb_place_component')).toBeDefined();
    expect(registry.get('easyeda_pcb_add_track')).toBeDefined();
    expect(registry.get('easyeda_pcb_add_via')).toBeDefined();
    expect(registry.get('easyeda_pcb_add_zone')).toBeDefined();
    expect(registry.get('easyeda_pcb_delete_component')).toBeDefined();
    expect(registry.get('easyeda_pcb_modify_component')).toBeDefined();
  });

  it('easyeda_pcb_place_component should call bridge and return success', async () => {
    const tool = registry.get('easyeda_pcb_place_component');
    bridgeCall.mockResolvedValue('comp-1234');

    const result = await tool?.handler(context, {
      footprint: 'SOIC-8',
      x: 10,
      y: 20,
      rotation: 90,
      layer: 1,
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith('pcb.placeComponent', {
      footprint: 'SOIC-8',
      x: 10,
      y: 20,
      rotation: 90,
      layer: 1,
    });
    expect(result).toEqual({
      success: true,
      primitiveId: 'comp-1234',
      result: 'comp-1234',
    });
  });

  it('easyeda_pcb_add_track should flatten points and call bridge', async () => {
    const tool = registry.get('easyeda_pcb_add_track');
    bridgeCall.mockResolvedValue({ result: 'track-5678' });

    const result = await tool?.handler(context, {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      layer: 1,
      width: 0.254,
      netName: 'GND',
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith('pcb.addTrack', {
      points: [0, 0, 10, 10],
      layer: 1,
      width: 0.254,
      netName: 'GND',
    });
    expect(result).toEqual({
      success: true,
      primitiveId: 'track-5678',
    });
  });

  it('easyeda_pcb_add_via should place a via', async () => {
    const tool = registry.get('easyeda_pcb_add_via');
    bridgeCall.mockResolvedValue('via-999');

    const result = await tool?.handler(context, {
      x: 15,
      y: 15,
      outerDiameter: 0.6,
      holeSize: 0.3,
      netName: 'VCC',
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith('pcb.addVia', {
      x: 15,
      y: 15,
      outerDiameter: 0.6,
      holeSize: 0.3,
      netName: 'VCC',
    });
    expect(result).toEqual({
      success: true,
      primitiveId: 'via-999',
    });
  });

  it('easyeda_pcb_add_zone should place a zone', async () => {
    const tool = registry.get('easyeda_pcb_add_zone');
    bridgeCall.mockResolvedValue('zone-111');

    const result = await tool?.handler(context, {
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      layer: 2,
      netName: 'GND',
      clearance: 0.5,
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith('pcb.addZone', {
      points: [0, 0, 20, 0, 20, 20, 0, 20],
      layer: 2,
      netName: 'GND',
      clearance: 0.5,
    });
    expect(result).toEqual({
      success: true,
      primitiveId: 'zone-111',
    });
  });

  it('easyeda_pcb_delete_component should call bridge delete', async () => {
    const tool = registry.get('easyeda_pcb_delete_component');
    bridgeCall.mockResolvedValue(true);

    const result = await tool?.handler(context, {
      primitiveIds: ['comp-1', 'comp-2'],
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith('pcb.deleteComponent', {
      primitiveIds: ['comp-1', 'comp-2'],
    });
    expect(result).toEqual({
      success: true,
      deletedCount: 2,
    });
  });

  it('easyeda_pcb_modify_component should call bridge modify', async () => {
    const tool = registry.get('easyeda_pcb_modify_component');
    bridgeCall.mockResolvedValue(true);

    const result = await tool?.handler(context, {
      primitiveId: 'comp-1',
      property: { x: 50, rotation: 180 },
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith('pcb.modifyComponent', {
      primitiveId: 'comp-1',
      property: { x: 50, rotation: 180 },
    });
    expect(result).toEqual({
      success: true,
    });
  });

  it('add_silkscreen_text frame="bottom-view" reflects rotation on bottom silk (layer 4)', async () => {
    const tool = registry.get('easyeda_pcb_add_silkscreen_text');
    bridgeCall.mockResolvedValue('str-1');

    await tool?.handler(context, {
      x: 0,
      y: 0,
      text: 'B',
      layer: 4,
      rotation: 21,
      frame: 'bottom-view',
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith(
      'pcb.addSilkText',
      expect.objectContaining({ layer: 4, rotation: 339 }),
    );
  });

  it('add_silkscreen_text frame="bottom-view" is a no-op on top silk (layer 3)', async () => {
    const tool = registry.get('easyeda_pcb_add_silkscreen_text');
    bridgeCall.mockResolvedValue('str-2');

    await tool?.handler(context, {
      x: 0,
      y: 0,
      text: 'T',
      layer: 3,
      rotation: 21,
      frame: 'bottom-view',
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith(
      'pcb.addSilkText',
      expect.objectContaining({ layer: 3, rotation: 21 }),
    );
  });

  it('add_silkscreen_text default frame passes rotation through unchanged', async () => {
    const tool = registry.get('easyeda_pcb_add_silkscreen_text');
    bridgeCall.mockResolvedValue('str-3');

    await tool?.handler(context, {
      x: 0,
      y: 0,
      text: 'B',
      layer: 4,
      rotation: 21,
      frame: 'stored',
      confirmWrite: true,
    });

    expect(bridgeCall).toHaveBeenCalledWith(
      'pcb.addSilkText',
      expect.objectContaining({ layer: 4, rotation: 21 }),
    );
  });
});

describe('resolveSilkscreenRotation', () => {
  it('returns rotation verbatim in the default "stored" frame', () => {
    expect(resolveSilkscreenRotation(21, 4, 'stored')).toBe(21);
    expect(resolveSilkscreenRotation(340, 4, 'stored')).toBe(340);
  });

  it('reflects the rotation on bottom-side layers in "bottom-view" frame', () => {
    // The mistake this guards against: top-plane rotation 21 must become 339.
    expect(resolveSilkscreenRotation(21, 4, 'bottom-view')).toBe(339);
    expect(resolveSilkscreenRotation(59, 4, 'bottom-view')).toBe(301);
    // other bottom-side layers reflect too (6=bottom mask)
    expect(resolveSilkscreenRotation(50, 6, 'bottom-view')).toBe(310);
  });

  it('is a no-op on top-side layers even when frame is "bottom-view"', () => {
    expect(resolveSilkscreenRotation(21, 3, 'bottom-view')).toBe(21);
    expect(resolveSilkscreenRotation(90, 1, 'bottom-view')).toBe(90);
  });

  it('normalizes the reflected result to [0, 360) (no negatives, no >=360)', () => {
    expect(resolveSilkscreenRotation(0, 4, 'bottom-view')).toBe(0); // 360-0 -> 360 -> 0
    expect(resolveSilkscreenRotation(-20, 4, 'bottom-view')).toBe(20); // 360-(-20)=380 -> 20
    expect(resolveSilkscreenRotation(390, 4, 'bottom-view')).toBe(330); // 360-390=-30 -> 330
  });
});
