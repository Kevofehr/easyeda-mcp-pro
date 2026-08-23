import { describe, expect, it } from 'vitest';
import { buildRp2040ServoModuleScaffold } from '../../../src/workflows/rp2040-servo-module-scaffold.js';
import { rectsOverlap } from '../../../src/workflows/schematic-safe-region.js';

const deviceItem = { libraryUuid: 'lib', uuid: 'dev' };
const devices = {
  resistor0402: deviceItem,
  capacitor0402: deviceItem,
  capacitor0603: deviceItem,
  capacitorPolarized: deviceItem,
  rp2040: deviceItem,
  drv8244: deviceItem,
  w25q16: deviceItem,
  txs0102: deviceItem,
  regulator3v3: deviceItem,
  usbC: deviceItem,
  ws2812b: deviceItem,
  conn01x10: deviceItem,
  conn01x06: deviceItem,
  conn01x03: deviceItem,
  crystal: deviceItem,
  switchSmd: deviceItem,
  fuse: deviceItem,
  diode: deviceItem,
};

const a3Sheet = { currentPage: { width: 1682, height: 1189 } };

describe('RP2040 servo-module scaffold', () => {
  it('builds seven visible, non-overlapping sections without inventing a netlist', () => {
    const result = buildRp2040ServoModuleScaffold({
      projectId: 'servo',
      devices,
      sheetInfo: a3Sheet,
    });

    expect(result.safeRegion.blocked).toBe(false);
    expect(result.blocks.map((block) => block.id)).toEqual([
      'power_usb',
      'rp2040_core',
      'decoupling',
      'motor_driver',
      'level_shifter',
      'leds',
      'connectors',
    ]);
    expect(result.bom.referenceCount).toBe(56);
    expect(result.workflowInput.components).toHaveLength(56);
    expect(result.workflowInput.rectangles).toHaveLength(7);
    expect(result.workflowInput.texts).toHaveLength(7);
    expect(result.workflowInput.netPorts).toEqual([]);
    expect(result.workflowInput.wires).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      mode: 'placement-scaffold',
      electricalCompleteness: 'intentionally-incomplete',
      sectionFrameCount: 7,
      sectionTitleCount: 7,
      detachedNetPortCount: 0,
      wireCount: 0,
      allExpectedRefsAssigned: true,
      duplicateBlockRefs: [],
      missingBlockRefs: [],
      blocksNonOverlapping: true,
      placementAnchorsInsideBlocks: true,
    });
    expect(result.warnings.join('\n')).toContain('exact pin-to-net wiring is not inferred');

    const assignedRefs = result.blocks.flatMap((block) => block.refs).sort();
    expect(assignedRefs).toEqual([...result.bom.expectedRefs].sort());
    result.blocks.forEach((block, index) => {
      expect(block.frame.x).toBeGreaterThanOrEqual(result.safeRegion.bounds.x);
      expect(block.frame.y).toBeGreaterThanOrEqual(result.safeRegion.bounds.y);
      expect(block.frame.x + block.frame.width).toBeLessThanOrEqual(
        result.safeRegion.bounds.x + result.safeRegion.bounds.width,
      );
      expect(block.frame.y + block.frame.height).toBeLessThanOrEqual(
        result.safeRegion.bounds.y + result.safeRegion.bounds.height,
      );
      expect(block.titlePosition.x).toBeGreaterThanOrEqual(result.safeRegion.bounds.x);
      expect(block.titlePosition.y).toBeLessThanOrEqual(
        result.safeRegion.bounds.y + result.safeRegion.bounds.height,
      );
      for (const other of result.blocks.slice(index + 1)) {
        expect(rectsOverlap(block.frame, other.frame)).toBe(false);
      }
    });
  });

  it('places major components deterministically inside their functional sections', () => {
    const result = buildRp2040ServoModuleScaffold({
      projectId: 'servo',
      devices,
      sheetInfo: a3Sheet,
      anchor: { x: 100, y: 1080 },
    });
    const byRef = new Map(
      result.workflowInput.components?.map((component) => [component.ref, component]),
    );

    expect(result.safeRegion.blocked).toBe(false);
    expect(byRef.get('P1')?.placementOffset).toEqual({ dx: 90, dy: -140 });
    expect(byRef.get('U3')?.placementOffset).toEqual({ dx: 690, dy: -190 });
    expect(byRef.get('U4')?.placementOffset).toEqual({ dx: 220, dy: -390 });
    expect(byRef.get('LED4')?.placementOffset).toEqual({ dx: 780, dy: -500 });
    expect(byRef.get('J4')?.placementOffset).toEqual({ dx: 700, dy: -665 });

    expect(result.blocks.find((block) => block.id === 'power_usb')).toMatchObject({
      title: 'power and usb',
      origin: { x: 100, y: 1045 },
      frame: { x: 100, y: 825, width: 380, height: 220 },
    });
    expect(result.blocks.find((block) => block.id === 'rp2040_core')?.refs).toContain('U3');
    expect(result.blocks.find((block) => block.id === 'decoupling')?.refs).toEqual(
      expect.arrayContaining(['R13', 'R14', 'R15']),
    );
  });

  it('blocks an explicit anchor that would leave usable bounds or overlap the title block', () => {
    const result = buildRp2040ServoModuleScaffold({
      projectId: 'servo',
      devices,
      sheetInfo: a3Sheet,
      anchor: { x: 900, y: 760 },
    });

    expect(result.safeRegion.blocked).toBe(true);
    expect(result.safeRegion.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'EXPLICIT_ANCHOR_OUTSIDE_USABLE_BOUNDS',
        'EXPLICIT_ANCHOR_OVERLAPS_TITLE_BLOCK',
      ]),
    );
  });

  it('maps representative references to the correct device buckets', () => {
    const unique = (uuid: string) => ({ libraryUuid: 'lib', uuid });
    const result = buildRp2040ServoModuleScaffold({
      projectId: 'servo',
      devices: {
        ...devices,
        resistor0402: unique('res'),
        capacitor0402: unique('cap0402'),
        capacitor0603: unique('cap0603'),
        capacitorPolarized: unique('cap-pol'),
        rp2040: unique('rp2040'),
        usbC: unique('usb-c'),
      },
    });
    const byRef = new Map(
      result.workflowInput.components?.map((component) => [component.ref, component]),
    );

    expect(byRef.get('R10')?.deviceItem.uuid).toBe('res');
    expect(byRef.get('C11')?.deviceItem.uuid).toBe('cap0402');
    expect(byRef.get('C5')?.deviceItem.uuid).toBe('cap0603');
    expect(byRef.get('C7')?.deviceItem.uuid).toBe('cap-pol');
    expect(byRef.get('U3')?.deviceItem.uuid).toBe('rp2040');
    expect(byRef.get('P1')?.deviceItem.uuid).toBe('usb-c');
  });
});
