import {
  planSafeSchematicRegion,
  rectsOverlap,
  type SchematicRect,
  type SchematicRegionPreference,
} from './schematic-safe-region.js';
import type { WorkflowBlockInput, WorkflowDeviceItem } from './types.js';

export type ServoModuleBlockId =
  | 'power_usb'
  | 'rp2040_core'
  | 'decoupling'
  | 'motor_driver'
  | 'leds'
  | 'connectors'
  | 'level_shifter';

export interface ServoModuleBlockPlan {
  id: ServoModuleBlockId;
  title: string;
  /** Top-left planning origin. The public rectangle frame below uses normalized bottom-left coordinates. */
  origin: { x: number; y: number };
  size: { width: number; height: number };
  frame: SchematicRect;
  titlePosition: { x: number; y: number };
  refs: string[];
}

export interface Rp2040ServoModuleDevices {
  resistor0402: WorkflowDeviceItem;
  capacitor0402: WorkflowDeviceItem;
  capacitor0603: WorkflowDeviceItem;
  capacitorPolarized: WorkflowDeviceItem;
  rp2040: WorkflowDeviceItem;
  drv8244: WorkflowDeviceItem;
  w25q16: WorkflowDeviceItem;
  txs0102: WorkflowDeviceItem;
  regulator3v3: WorkflowDeviceItem;
  usbC: WorkflowDeviceItem;
  ws2812b: WorkflowDeviceItem;
  conn01x10: WorkflowDeviceItem;
  conn01x06: WorkflowDeviceItem;
  conn01x03: WorkflowDeviceItem;
  crystal: WorkflowDeviceItem;
  switchSmd: WorkflowDeviceItem;
  fuse: WorkflowDeviceItem;
  diode: WorkflowDeviceItem;
}

export interface Rp2040ServoModuleInput {
  projectId: string;
  mode?: 'preview' | 'apply';
  devices: Rp2040ServoModuleDevices;
  sheetInfo?: unknown;
  anchor?: { x: number; y: number };
  preferredRegion?: SchematicRegionPreference;
  margin?: number;
}

export interface Rp2040ServoModulePlan {
  workflowInput: WorkflowBlockInput;
  safeRegion: ReturnType<typeof planSafeSchematicRegion>;
  blocks: ServoModuleBlockPlan[];
  bom: {
    expectedRefs: string[];
    referenceCount: number;
    symbolGroups: Array<{ symbol: string; refs: string[]; count: number }>;
  };
  diagnostics: {
    mode: 'placement-scaffold';
    electricalCompleteness: 'intentionally-incomplete';
    sectionFrameCount: number;
    sectionTitleCount: number;
    detachedNetPortCount: number;
    wireCount: number;
    allExpectedRefsAssigned: boolean;
    duplicateBlockRefs: string[];
    missingBlockRefs: string[];
    blocksNonOverlapping: boolean;
    placementAnchorsInsideBlocks: boolean;
    drcExpectation: string;
    ercExpectation: string;
  };
  warnings: string[];
  notes: string[];
}

// Includes every visible frame/title and leaves a 30-unit guard below the connector block.
const CONTENT = { width: 1260, height: 760 } as const;
const SECTION_TITLE_RISE = 18;

const BLOCK_DEFS: Array<
  Omit<ServoModuleBlockPlan, 'origin' | 'frame' | 'titlePosition'> & {
    offset: { dx: number; dy: number };
  }
> = [
  {
    id: 'power_usb',
    title: 'power and usb',
    offset: { dx: 0, dy: -35 },
    size: { width: 380, height: 220 },
    refs: ['P1', 'FH1', 'D1', 'U2', 'C5', 'C7', 'C9', 'C10', 'R1', 'R2', 'R3', 'R4'],
  },
  {
    id: 'rp2040_core',
    title: 'rp2040 and reqs',
    offset: { dx: 410, dy: -35 },
    size: { width: 490, height: 340 },
    refs: ['U3', 'U1', 'X1', 'SW1', 'SW2', 'R5', 'R6', 'R7', 'R8', 'R9', 'C1', 'C2', 'C3', 'C4'],
  },
  {
    id: 'decoupling',
    title: 'decoupling and rails',
    offset: { dx: 930, dy: -20 },
    size: { width: 330, height: 240 },
    refs: [
      'C6',
      'C8',
      'C11',
      'C12',
      'C13',
      'C14',
      'C15',
      'C16',
      'C19',
      'C20',
      'C21',
      'C22',
      'R13',
      'R14',
      'R15',
    ],
  },
  {
    id: 'motor_driver',
    title: 'motor driver',
    offset: { dx: 0, dy: -310 },
    size: { width: 380, height: 180 },
    refs: ['U4', 'R10', 'R11', 'R12', 'C17', 'C18'],
  },
  {
    id: 'level_shifter',
    title: 'level shifter',
    offset: { dx: 930, dy: -310 },
    size: { width: 330, height: 150 },
    refs: ['U5'],
  },
  {
    id: 'leds',
    title: 'LEDs',
    offset: { dx: 410, dy: -430 },
    size: { width: 490, height: 130 },
    refs: ['LED1', 'LED2', 'LED3', 'LED4'],
  },
  {
    id: 'connectors',
    title: 'connectors',
    offset: { dx: 0, dy: -600 },
    size: { width: 900, height: 130 },
    refs: ['J1', 'J2', 'J3', 'J4'],
  },
];

const SYMBOL_GROUPS = [
  {
    symbol: 'symbols_R',
    refs: [
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
      'R6',
      'R7',
      'R8',
      'R9',
      'R10',
      'R11',
      'R12',
      'R13',
      'R14',
      'R15',
    ],
  },
  {
    symbol: 'symbols_C',
    refs: [
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
      'C6',
      'C8',
      'C9',
      'C10',
      'C11',
      'C12',
      'C13',
      'C14',
      'C15',
      'C16',
      'C17',
      'C18',
      'C19',
      'C20',
      'C21',
      'C22',
    ],
  },
  { symbol: 'symbols_C_Polarized', refs: ['C7'] },
  { symbol: 'symbols_DRV8244SQRYJRQ1', refs: ['U4'] },
  { symbol: 'symbols_WS2812B-2020', refs: ['LED1', 'LED2', 'LED3', 'LED4'] },
  { symbol: 'symbols_W25Q16JVSS', refs: ['U1'] },
  { symbol: 'symbols_RP2040', refs: ['U3'] },
  { symbol: 'symbols_TXS0102DCU', refs: ['U5'] },
  { symbol: 'symbols_USB_C_Plug_USB2.0', refs: ['P1'] },
  { symbol: 'symbols_ME6211A33M3G-N', refs: ['U2'] },
  { symbol: 'symbols_ABM8-272-T3_C20625731', refs: ['X1'] },
  { symbol: 'symbols_TS-1088-AR02016', refs: ['SW1', 'SW2'] },
  { symbol: 'symbols_Conn_01x10', refs: ['J1', 'J2'] },
  { symbol: 'symbols_Conn_01x06', refs: ['J4'] },
  { symbol: 'symbols_Conn_01x03', refs: ['J3'] },
  { symbol: 'symbols_01550900M', refs: ['FH1'] },
  { symbol: 'symbols_MBR1020VL', refs: ['D1'] },
] as const;

function devFor(ref: string, devices: Rp2040ServoModuleDevices): WorkflowDeviceItem {
  if (ref.startsWith('R')) return devices.resistor0402;
  if (ref === 'C7') return devices.capacitorPolarized;
  if (['C5', 'C9'].includes(ref)) return devices.capacitor0603;
  if (ref.startsWith('C')) return devices.capacitor0402;
  if (ref === 'U3') return devices.rp2040;
  if (ref === 'U4') return devices.drv8244;
  if (ref === 'U1') return devices.w25q16;
  if (ref === 'U5') return devices.txs0102;
  if (ref === 'U2') return devices.regulator3v3;
  if (ref === 'P1') return devices.usbC;
  if (ref.startsWith('LED')) return devices.ws2812b;
  if (ref === 'J1' || ref === 'J2') return devices.conn01x10;
  if (ref === 'J4') return devices.conn01x06;
  if (ref === 'J3') return devices.conn01x03;
  if (ref === 'X1') return devices.crystal;
  if (ref === 'SW1' || ref === 'SW2') return devices.switchSmd;
  if (ref === 'FH1') return devices.fuse;
  if (ref === 'D1') return devices.diode;
  return devices.resistor0402;
}

const REF_OFFSETS: Record<string, { dx: number; dy: number; rotation?: number }> = {
  P1: { dx: 90, dy: -140 },
  FH1: { dx: 45, dy: -220 },
  D1: { dx: 235, dy: -100 },
  U2: { dx: 270, dy: -110 },
  R1: { dx: 40, dy: -60, rotation: 180 },
  R2: { dx: 45, dy: -105, rotation: 180 },
  R3: { dx: 160, dy: -60, rotation: 180 },
  R4: { dx: 160, dy: -105, rotation: 180 },
  C5: { dx: 315, dy: -70 },
  C7: { dx: 170, dy: -170 },
  C9: { dx: 270, dy: -165 },
  C10: { dx: 340, dy: -165 },

  U3: { dx: 690, dy: -190 },
  U1: { dx: 535, dy: -140 },
  X1: { dx: 535, dy: -290 },
  SW1: { dx: 580, dy: -215 },
  SW2: { dx: 770, dy: -80 },
  R5: { dx: 510, dy: -220, rotation: 270 },
  R6: { dx: 475, dy: -80, rotation: 180 },
  R7: { dx: 600, dy: -295 },
  R8: { dx: 610, dy: -125, rotation: 180 },
  R9: { dx: 645, dy: -125, rotation: 180 },
  C1: { dx: 425, dy: -235 },
  C2: { dx: 510, dy: -335 },
  C3: { dx: 460, dy: -240 },
  C4: { dx: 615, dy: -335 },

  C6: { dx: 955, dy: -110 },
  C8: { dx: 1085, dy: -220 },
  C11: { dx: 950, dy: -65 },
  C12: { dx: 965, dy: -180 },
  C13: { dx: 1005, dy: -180 },
  C14: { dx: 1045, dy: -200 },
  C15: { dx: 1035, dy: -65 },
  C16: { dx: 1030, dy: -100 },
  C19: { dx: 1120, dy: -65 },
  C20: { dx: 1130, dy: -115 },
  C21: { dx: 1170, dy: -160 },
  C22: { dx: 1225, dy: -65 },
  R13: { dx: 1100, dy: -140 },
  R14: { dx: 940, dy: -140 },
  R15: { dx: 940, dy: -180 },

  U4: { dx: 220, dy: -390 },
  R10: { dx: 155, dy: -390, rotation: 90 },
  R11: { dx: 255, dy: -390, rotation: 90 },
  R12: { dx: 45, dy: -430 },
  C17: { dx: 45, dy: -465 },
  C18: { dx: 110, dy: -465 },

  U5: { dx: 1080, dy: -390 },
  LED1: { dx: 450, dy: -500 },
  LED2: { dx: 560, dy: -500 },
  LED3: { dx: 670, dy: -500 },
  LED4: { dx: 780, dy: -500 },

  J1: { dx: 95, dy: -665 },
  J2: { dx: 340, dy: -665 },
  J3: { dx: 540, dy: -690 },
  J4: { dx: 700, dy: -665 },
};

function expectedRefs(): string[] {
  return [...new Set(SYMBOL_GROUPS.flatMap((group) => [...group.refs]))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
}

function buildBlocks(anchor: { x: number; y: number }): ServoModuleBlockPlan[] {
  return BLOCK_DEFS.map((block) => {
    const origin = { x: anchor.x + block.offset.dx, y: anchor.y + block.offset.dy };
    return {
      id: block.id,
      title: block.title,
      size: block.size,
      refs: block.refs,
      origin,
      frame: {
        x: origin.x,
        y: origin.y - block.size.height,
        width: block.size.width,
        height: block.size.height,
      },
      titlePosition: { x: origin.x + 12, y: origin.y + SECTION_TITLE_RISE },
    };
  });
}

function actualSafeRegionForAnchor(
  base: ReturnType<typeof planSafeSchematicRegion>,
  explicitAnchor: { x: number; y: number } | undefined,
): ReturnType<typeof planSafeSchematicRegion> {
  if (!explicitAnchor) return base;
  const bounds: SchematicRect = {
    x: explicitAnchor.x,
    y: explicitAnchor.y - CONTENT.height,
    width: CONTENT.width,
    height: CONTENT.height,
  };
  const issues = base.issues.filter((entry) =>
    ['INVALID_CONTENT_SIZE', 'CONTENT_DOES_NOT_FIT_USABLE_BOUNDS'].includes(entry.code),
  );
  if (
    bounds.x < base.usableBounds.x ||
    bounds.y < base.usableBounds.y ||
    bounds.x + bounds.width > base.usableBounds.x + base.usableBounds.width ||
    bounds.y + bounds.height > base.usableBounds.y + base.usableBounds.height
  ) {
    issues.push({
      code: 'EXPLICIT_ANCHOR_OUTSIDE_USABLE_BOUNDS',
      message: 'The explicit top-left anchor places part of the scaffold outside usable bounds.',
    });
  }
  if (base.keepouts.some((keepout) => rectsOverlap(bounds, keepout))) {
    issues.push({
      code: 'EXPLICIT_ANCHOR_OVERLAPS_TITLE_BLOCK',
      message: 'The explicit top-left anchor places the scaffold over the title-block keep-out.',
    });
  }
  return {
    ...base,
    blocked: issues.length > 0,
    requestedBounds: bounds,
    bounds,
    anchor: explicitAnchor,
    warnings: [],
    issues,
  };
}

function duplicated(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort((a, b) => a.localeCompare(b, 'en'));
}

function buildDiagnostics(
  refs: string[],
  blocks: ServoModuleBlockPlan[],
  anchor: { x: number; y: number },
): Rp2040ServoModulePlan['diagnostics'] {
  const assignedRefs = blocks.flatMap((block) => block.refs);
  const assigned = new Set(assignedRefs);
  const blockForRef = new Map(blocks.flatMap((block) => block.refs.map((ref) => [ref, block])));
  const framesOverlap = blocks.some((block, index) =>
    blocks.slice(index + 1).some((other) => rectsOverlap(block.frame, other.frame)),
  );
  const placementAnchorsInsideBlocks = refs.every((ref) => {
    const block = blockForRef.get(ref);
    const offset = REF_OFFSETS[ref];
    if (!block || !offset) return false;
    const x = anchor.x + offset.dx;
    const y = anchor.y + offset.dy;
    return (
      x >= block.frame.x &&
      x <= block.frame.x + block.frame.width &&
      y >= block.frame.y &&
      y <= block.frame.y + block.frame.height
    );
  });

  return {
    mode: 'placement-scaffold',
    electricalCompleteness: 'intentionally-incomplete',
    sectionFrameCount: blocks.length,
    sectionTitleCount: blocks.length,
    detachedNetPortCount: 0,
    wireCount: 0,
    allExpectedRefsAssigned: refs.every((ref) => assigned.has(ref)),
    duplicateBlockRefs: duplicated(assignedRefs),
    missingBlockRefs: refs.filter((ref) => !assigned.has(ref)),
    blocksNonOverlapping: !framesOverlap,
    placementAnchorsInsideBlocks,
    drcExpectation:
      'No wires, net ports, or net labels are created in placement-scaffold mode; section frames and titles are cosmetic.',
    ercExpectation:
      'Incomplete by design: components are intentionally unconnected until block-level netlists are supplied.',
  };
}

export function buildRp2040ServoModuleScaffold(
  input: Rp2040ServoModuleInput,
): Rp2040ServoModulePlan {
  const safeRegion = actualSafeRegionForAnchor(
    planSafeSchematicRegion({
      sheetInfo: input.sheetInfo,
      contentWidth: CONTENT.width,
      contentHeight: CONTENT.height,
      preferredRegion: input.preferredRegion ?? 'upper-left',
      margin: input.margin,
    }),
    input.anchor,
  );
  const anchor = input.anchor ?? safeRegion.anchor;
  const refs = expectedRefs();
  const components = refs.map((ref) => {
    const offset = REF_OFFSETS[ref] ?? { dx: 0, dy: 0 };
    return {
      ref,
      role: `servo-module:${ref}`,
      deviceItem: devFor(ref, input.devices),
      placementOffset: { dx: offset.dx, dy: offset.dy },
      rotation: offset.rotation,
      pinConnections: [],
    };
  });

  const blocks = buildBlocks(anchor);
  const workflowInput: WorkflowBlockInput = {
    projectId: input.projectId,
    mode: input.mode ?? 'preview',
    anchor,
    spacing: 50,
    components,
    netPorts: [],
    wires: [],
    rectangles: blocks.map((block) => ({
      ref: `section:${block.id}:frame`,
      role: `servo-module-section:${block.id}`,
      placementOffset: { dx: block.frame.x - anchor.x, dy: block.frame.y - anchor.y },
      width: block.frame.width,
      height: block.frame.height,
      cornerRadius: 0,
      rotation: 0,
      color: '#6B7280',
      fillColor: 'none',
      lineWidth: 1,
      lineType: 0,
      fillStyle: 'none',
    })),
    texts: blocks.map((block) => ({
      ref: `section:${block.id}:title`,
      role: `servo-module-section-title:${block.id}`,
      placementOffset: {
        dx: block.titlePosition.x - anchor.x,
        dy: block.titlePosition.y - anchor.y,
      },
      content: block.title.toUpperCase(),
      rotation: 0,
      color: '#111827',
      fontName: 'Arial',
      fontSize: 16,
      bold: true,
      italic: false,
      underline: false,
      alignMode: 1,
    })),
  };
  const diagnostics = buildDiagnostics(refs, blocks, anchor);

  return {
    workflowInput,
    safeRegion,
    blocks,
    bom: {
      expectedRefs: refs,
      referenceCount: refs.length,
      symbolGroups: SYMBOL_GROUPS.map((group) => ({
        symbol: group.symbol,
        refs: [...group.refs],
        count: group.refs.length,
      })),
    },
    diagnostics,
    warnings: [
      'This scaffold intentionally places BOM blocks only; exact pin-to-net wiring is not inferred from screenshot+BOM.',
      'Use follow-up block workflows for power/USB, RP2040 core, motor driver, LEDs, connectors, and level shifter netlists.',
      'Apply mode will place components without electrical connectivity, so ERC warnings are expected until block netlists are added.',
    ],
    notes: [
      'Functional blocks mirror the user-provided servo-module reference: power and usb, rp2040 and reqs, motor driver, LEDs, connectors, decoupling, and level shifter.',
      'Each functional block now has a visible rollback-backed rectangle and title in preview/apply operations.',
      'Detached netports are disabled by default; future netlist milestones should add visible wiring per block.',
    ],
  };
}
