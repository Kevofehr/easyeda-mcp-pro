/**
 * PCB constraints — error codes, issues, and factory helpers.
 *
 * Follows the same pattern as `CircuitError` and `NetValidationIssue`:
 * const-object enums + structured issue interfaces + factory functions.
 *
 * @module
 */

import type { PcbConstraintCode, PcbConstraintIssue } from './types.js';

// ── Error code map entry ────────────────────────────────────────────────────

export interface PcbConstraintCodeEntry {
  code: PcbConstraintCode;
  message: string;
  severity: 'error' | 'warning';
  remediationHint: string;
}

// ── Error code map ──────────────────────────────────────────────────────────

/**
 * Map of friendly names to PCB constraint code entries.
 * Each entry contains the actual code string, default message, severity, and remediation hint.
 */
export const PcbConstraintCodeMap: Record<string, PcbConstraintCodeEntry> = {
  MISSING_BOARD_OUTLINE: {
    code: 'PCB_MISSING_OUTLINE',
    message: 'Board outline is not defined',
    severity: 'error',
    remediationHint:
      'Define a board outline with at least 3 polygon points in the PCB intent or board dimensions',
  },
  OUTLINE_TOO_SMALL: {
    code: 'PCB_OUTLINE_TOO_SMALL',
    message: 'Board outline dimensions are below recommended minimum',
    severity: 'warning',
    remediationHint:
      'Verify the board dimensions are correct. Very small boards may be difficult to manufacture.',
  },
  LAYER_COUNT_MISMATCH: {
    code: 'PCB_LAYER_COUNT_MISMATCH',
    message: 'Layer count mismatch between intent and board',
    severity: 'error',
    remediationHint:
      'For boards with more than 2 layers, a complete layer stackup is required for fabrication',
  },
  NO_LAYER_STACK: {
    code: 'PCB_MISSING_STACKUP',
    message: 'Detailed layer stackup is not defined',
    severity: 'warning',
    remediationHint:
      'Define a layer stackup with thickness, material, and copper weight for each layer to ensure manufacturability',
  },
  NO_MOUNTING_HOLES: {
    code: 'PCB_MISSING_MOUNTING_HOLES',
    message: 'No mounting holes defined on the board',
    severity: 'warning',
    remediationHint:
      'Add at least 4 mounting holes (one near each corner) for mechanical stability and assembly',
  },
  NO_NET_CLASSES: {
    code: 'PCB_MISSING_NET_CLASSES',
    message: 'No net classes with routing rules are defined',
    severity: 'warning',
    remediationHint:
      'Define net classes for power, signal, and high-speed nets to enforce trace width and clearance rules',
  },
  INVALID_CLEARANCE: {
    code: 'PCB_INVALID_CLEARANCE',
    message: 'Net classes are defined but no clearance rules between them',
    severity: 'warning',
    remediationHint:
      'Add clearance rules between each pair of net classes (e.g., power-to-signal, high-voltage-to-signal)',
  },
  NO_CLEARANCE_RULES: {
    code: 'PCB_INVALID_CLEARANCE',
    message: 'No clearance rules defined between net classes',
    severity: 'warning',
    remediationHint: 'Add clearance rules between each pair of net classes',
  },
  KEEPOUT_VIOLATION: {
    code: 'PCB_KEEPOUT_VIOLATION',
    message: 'Placement zones are defined but no keepout/restricted areas',
    severity: 'warning',
    remediationHint:
      'Consider adding keepout areas to prevent component or track placement in restricted zones',
  },
  NO_KEEPOUT_AREAS: {
    code: 'PCB_KEEPOUT_VIOLATION',
    message: 'No keepout or restricted areas defined',
    severity: 'warning',
    remediationHint:
      'Consider adding keepout areas to prevent component or track placement in restricted zones',
  },
  NO_PLACEMENT_ZONES: {
    code: 'PCB_MISSING_PLACEMENT_ZONES',
    message: 'No placement zones defined for component grouping',
    severity: 'warning',
    remediationHint:
      'Define placement zones (power, analog, digital, etc.) to guide component placement and improve signal integrity',
  },
  MANUFACTURING_OPTIONS_WARNING: {
    code: 'PCB_MISSING_MANUFACTURING_CONSTRAINTS',
    message: 'Manufacturing process or production quantity is not specified',
    severity: 'warning',
    remediationHint:
      'Specify the manufacturing process and target production quantity to select appropriate fabrication requirements',
  },
  NO_FIDUCIALS: {
    code: 'PCB_FIDUCIAL_REQUIRED',
    message: 'No fiducial marks defined for SMT assembly',
    severity: 'warning',
    remediationHint:
      'Add at least 3 fiducial marks (global, near board corners) for pick-and-place machine alignment',
  },
  NO_TEST_PADS: {
    code: 'PCB_CONSTRAINT_INTERNAL',
    message: 'No test pads defined for board testing',
    severity: 'warning',
    remediationHint:
      'Consider adding test pads for key nets to enable board-level testing and debugging',
  },
  HIGH_VOLTAGE_CLEARANCE: {
    code: 'PCB_HIGH_VOLTAGE_CLEARANCE',
    message: 'High-voltage domain detected but no clearance rules defined',
    severity: 'error',
    remediationHint:
      'Define explicit creepage and clearance distances for high-voltage nets. Minimum 4mm clearance for 250V AC is recommended.',
  },

  DRILL_FILE_MISSING: {
    code: 'PCB_DRILL_FILE_MISSING',
    message: 'NC drill file is missing from the manufacturing package',
    severity: 'error',
    remediationHint: 'Re-export the manufacturing package with Excellon/NC drill files included',
  },
  COPPER_EDGE_CLEARANCE: {
    code: 'PCB_COPPER_EDGE_CLEARANCE',
    message: 'Copper is too close to the board edge',
    severity: 'error',
    remediationHint:
      'Move copper, zones, vias, and pads away from the routed board edge or increase the copper-to-edge clearance rule',
  },
  DRILL_TOO_SMALL: {
    code: 'PCB_DRILL_TOO_SMALL',
    message: 'Minimum drill diameter is below common fabrication capability',
    severity: 'warning',
    remediationHint:
      'Increase finished drill diameter or confirm the selected fabricator supports the requested drill size',
  },
  ANNULAR_RING_TOO_SMALL: {
    code: 'PCB_ANNULAR_RING_TOO_SMALL',
    message: 'Annular ring is below recommended manufacturing minimum',
    severity: 'warning',
    remediationHint:
      'Increase pad/via diameter or reduce drill size to maintain enough annular ring for registration tolerance',
  },
  SOLDERMASK_SLIVER: {
    code: 'PCB_SOLDERMASK_SLIVER',
    message: 'Soldermask sliver is below recommended minimum',
    severity: 'warning',
    remediationHint:
      'Increase pad spacing, adjust soldermask expansion, or remove soldermask dams intentionally where supported',
  },
  SILKSCREEN_OVER_PAD: {
    code: 'PCB_SILKSCREEN_OVER_PAD',
    message: 'Silkscreen overlaps exposed copper pads',
    severity: 'warning',
    remediationHint:
      'Move or clip silkscreen references/graphics so they do not print over solderable pads',
  },
  TOOLING_HOLE_MISSING: {
    code: 'PCB_TOOLING_HOLE_MISSING',
    message: 'Tooling holes are missing for assembly/panel fixture alignment',
    severity: 'warning',
    remediationHint:
      'Add tooling holes or confirm the assembler will provide panel-level tooling holes during panelization',
  },
  POLARITY_MARK_MISSING: {
    code: 'PCB_POLARITY_MARK_MISSING',
    message: 'Polarity or orientation marks are missing for polarized components',
    severity: 'warning',
    remediationHint:
      'Add clear silkscreen/courtyard polarity markers for diodes, LEDs, electrolytic capacitors, IC pin 1, and connectors',
  },
  COMPONENT_SPACING_VIOLATION: {
    code: 'PCB_COMPONENT_SPACING_VIOLATION',
    message: 'Component spacing/courtyard violations detected',
    severity: 'warning',
    remediationHint:
      'Increase component-to-component spacing or review courtyard overlap for assembly nozzle, hand-solder, and rework access',
  },
  TESTPOINT_COVERAGE_LOW: {
    code: 'PCB_TESTPOINT_COVERAGE_LOW',
    message: 'Critical nets are missing test points',
    severity: 'warning',
    remediationHint:
      'Add accessible test pads for power rails, ground, reset, boot, programming, clocks, and key interfaces',
  },
  PROGRAMMING_HEADER_MISSING: {
    code: 'PCB_PROGRAMMING_HEADER_MISSING',
    message: 'Programming/debug header is required but missing',
    severity: 'error',
    remediationHint:
      'Add a programming/debug connector or documented test pads for SWD/JTAG/UART/BOOT/RESET access',
  },
  FAB_NOTES_MISSING: {
    code: 'PCB_FAB_NOTES_MISSING',
    message: 'Fabrication notes are missing from the handoff package',
    severity: 'warning',
    remediationHint:
      'Add fabrication notes covering board thickness, copper weight, finish, soldermask color, impedance requirements, panelization, and special instructions',
  },
} as const;

// ── Factory helpers ────────────────────────────────────────────────────────

/**
 * Create a single PCB constraint issue.
 */
export function pcbConstraintIssue(
  code: PcbConstraintCode,
  message: string,
  opts?: {
    severity?: 'error' | 'warning';
    path?: string;
    constraintType?: string;
    constraintSeverity?: string;
    remediationHint?: string;
    details?: Record<string, unknown>;
  },
): PcbConstraintIssue {
  return {
    code,
    message,
    severity: opts?.severity ?? 'error',
    path: opts?.path,
    constraintType: opts?.constraintType,
    remediationHint: opts?.remediationHint ?? '',
    details: opts?.details,
  };
}

/**
 * Convenience: create an error-severity PCB constraint issue.
 */
export function pcbError(
  code: PcbConstraintCode,
  message: string,
  opts?: Omit<Parameters<typeof pcbConstraintIssue>[2], 'severity'>,
): PcbConstraintIssue {
  return pcbConstraintIssue(code, message, { ...opts, severity: 'error' });
}

/**
 * Convenience: create a warning-severity PCB constraint issue.
 */
export function pcbWarning(
  code: PcbConstraintCode,
  message: string,
  opts?: Omit<Parameters<typeof pcbConstraintIssue>[2], 'severity'>,
): PcbConstraintIssue {
  return pcbConstraintIssue(code, message, { ...opts, severity: 'warning' });
}
