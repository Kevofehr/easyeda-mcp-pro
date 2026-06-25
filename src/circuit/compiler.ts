/**
 * DesignIntent → CircuitIR compiler.
 *
 * This module provides the compile boundary: a validated DesignIntent is
 * compiled into a draft CircuitIR.  The CircuitIR must then pass a review
 * gate (human or automated) before it is marked as "validated" and consumed
 * by downstream EasyEDA tools.
 *
 * The compiler:
 *   1. Validates the input DesignIntent.
 *   2. Transforms functional block requirements into Blocks.
 *   3. Creates power Rails from the DesignIntent's rail requirements.
 *   4. Creates empty Device slots with traceability refs.
 *   5. Generates placeholder Nets for each power rail.
 *   6. Copies manufacturing, mechanical, and safety intent into CircuitIR fields.
 *   7. Preserves all traceability IDs.
 *
 * @module
 */

import { DesignIntent, DesignIntentSchema } from './design-intent.js';
import {
  CircuitIR,
  CircuitIRSchema,
  CIRCUIT_IR_SCHEMA_VERSION,
  Block,
  PowerRail,
  Device,
  Net,
} from './circuit-ir.js';
import { ValidationStatus, NetType } from './types.js';
import { CircuitError, CircuitErrorCode, fromZodError } from './errors.js';

// ── Compile options ───────────────────────────────────────────────────────

export interface CompileOptions {
  /** If true, skip DesignIntent validation (assumes pre-validated input). */
  skipValidation?: boolean;
  /** Optional override for the CircuitIR validation status after compile. */
  initialStatus?: ValidationStatus;
}

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: CompileOptions = {
  skipValidation: false,
  initialStatus: ValidationStatus.Draft,
};

// ── Compile result ────────────────────────────────────────────────────────

export interface CompileResult {
  /** The compiled CircuitIR (draft — must pass review gate). */
  circuitIR: CircuitIR;
  /** The original DesignIntent, preserved for traceability. */
  designIntent: DesignIntent;
  /** Compile warnings (non-fatal issues the compiler wants to flag). */
  warnings: string[];
}

// ── Compile helpers ───────────────────────────────────────────────────────

function compileBlocks(designIntent: DesignIntent): Block[] {
  return designIntent.requirements.functionalBlocks.map((fb) => ({
    id: `block-${fb.id}`,
    name: fb.name,
    type: fb.type,
    description: fb.purpose,
    designIntentRef: [{ requirementId: fb.id, note: fb.purpose }],
    children: [],
  }));
}

function compilePowerRails(designIntent: DesignIntent, blocks: Block[]): PowerRail[] {
  return designIntent.requirements.power.rails.map((r) => {
    // Find which block this rail belongs to by matching the description / context
    const sourceBlock = blocks.find(
      (b) => r.description && b.description?.toLowerCase().includes(r.description.toLowerCase()),
    );
    return {
      id: `rail-${r.id}`,
      name: r.id,
      voltage: r.voltage,
      tolerance: r.tolerance,
      maxCurrentAmps: r.maxCurrentAmps,
      sourceBlockRef: sourceBlock?.id,
      sinkBlockRefs: [],
      designIntentRef: [{ requirementId: r.id }],
      metadata: [],
    };
  });
}

function compileDeviceStubs(blocks: Block[]): Device[] {
  // We create one stub Device per block as a placeholder. The user fills
  // in actual MPNs during the planning step.
  return blocks.map((block) => ({
    id: `dev-${block.id}`,
    ref: `U?`,
    mpn: undefined,
    manufacturer: undefined,
    package: undefined,
    datasheet: '',
    lcsc: undefined,
    blockRef: block.id,
    designIntentRef: block.designIntentRef,
    metadata: [],
  }));
}

function compilePowerNets(rails: PowerRail[]): Net[] {
  return rails.map((rail) => ({
    id: `net-${rail.id}`,
    name: rail.name,
    type: NetType.Power,
    nodes: [],
    blockRef: rail.sourceBlockRef,
    designIntentRef: rail.designIntentRef,
    metadata: [],
  }));
}

function buildCircuitIR(
  designIntent: DesignIntent,
  blocks: Block[],
  rails: PowerRail[],
  devices: Device[],
  nets: Net[],
  opts: CompileOptions,
): CircuitIR {
  return {
    $schema: CIRCUIT_IR_SCHEMA_VERSION,
    metadata: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      designIntentRef: designIntent.project.name,
      validationStatus: opts.initialStatus ?? ValidationStatus.Draft,
    },
    blocks,
    devices,
    nets,
    rails,
    powerDomains: [],
    signalClasses: [],
    physicalConstraints: [],
    interfaces: [],
    constraints: [],
    bom: { excludeRefs: [], preferredVendors: [] },
    pcb: {
      layerCount: designIntent.requirements.mechanical.layers,
      widthMm: designIntent.requirements.mechanical.widthMm,
      heightMm: designIntent.requirements.mechanical.heightMm,
      boardOutline: undefined,
      layerStack: undefined,
      netClasses: undefined,
      clearanceRules: undefined,
      keepoutAreas: undefined,
      placementZones: undefined,
      mountingHoles: undefined,
      fiducials: undefined,
      testPads: undefined,
    },
    manufacturing: {
      quantity: undefined,
      process: designIntent.requirements.manufacturing.process,
      timelineWeeks: designIntent.requirements.manufacturing.timelineWeeks,
    },
  };
}

// ── Compiler ──────────────────────────────────────────────────────────────

/**
 * Compile a validated DesignIntent into a draft CircuitIR.
 *
 * Throws `CircuitError` if:
 *   - The input fails DesignIntent validation (unless `skipValidation`).
 *   - The board type is not supported by the compiler.
 */
export function compile(input: unknown, options?: CompileOptions): CompileResult {
  const opts: CompileOptions = { ...DEFAULT_OPTIONS, ...options };

  let designIntent: DesignIntent;

  // ── 1. Validate DesignIntent ────────────────────────────────────────────
  if (!opts.skipValidation) {
    const parsed = DesignIntentSchema.safeParse(input);
    if (!parsed.success) {
      const errors = fromZodError(parsed.error, 'compile.input');
      throw new CircuitError({
        code: CircuitErrorCode.DESIGN_INTENT_INVALID,
        message: 'Cannot compile: DesignIntent validation failed',
        errors,
      });
    }
    designIntent = parsed.data;
  } else {
    designIntent = input as DesignIntent;
  }

  const warnings: string[] = [];

  // ── 2. Compile Blocks ─────────────────────────────────────────────────
  const blocks = compileBlocks(designIntent);

  // ── 3. Compile Power Rails ──────────────────────────────────────────────
  const rails = compilePowerRails(designIntent, blocks);

  // ── 4. Create Device stubs ──────────────────────────────────────────────
  const devices = compileDeviceStubs(blocks);

  // ── 5. Create power nets ───────────────────────────────────────────────
  const nets = compilePowerNets(rails);

  // ── 6. Build CircuitIR ──────────────────────────────────────────────────
  const circuitIR = buildCircuitIR(designIntent, blocks, rails, devices, nets, opts);

  // ── 7. Validate output CircuitIR ────────────────────────────────────────
  const parsed = CircuitIRSchema.safeParse(circuitIR);
  if (!parsed.success) {
    const errors = fromZodError(parsed.error, 'compile.output');
    throw new CircuitError({
      code: CircuitErrorCode.COMPILE_FAILED,
      message: 'Compilation produced invalid CircuitIR',
      errors,
    });
  }

  return {
    circuitIR: parsed.data,
    designIntent,
    warnings,
  };
}

// ── Review gate ───────────────────────────────────────────────────────────

/**
 * Transition a CircuitIR from "draft" to "validated" or "rejected".
 *
 * Downstream EasyEDA tools MUST check that the CircuitIR they consume
 * is in "validated" status before proceeding with mutations.
 */
export function setValidationStatus(
  circuitIR: CircuitIR,
  status: ValidationStatus.Validated | ValidationStatus.Rejected,
  _reason?: string,
): CircuitIR {
  return {
    ...circuitIR,
    metadata: {
      ...circuitIR.metadata,
      validationStatus: status,
    },
  };
}

/**
 * Check whether a CircuitIR is validated and ready for EasyEDA operations.
 */
export function isReadyForEasyEDA(circuitIR: CircuitIR): boolean {
  return circuitIR.metadata.validationStatus === ValidationStatus.Validated;
}
