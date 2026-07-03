/**
 * Net validation — error codes, structured issues, and factories.
 *
 * Follows the same pattern as `CircuitError` / `CatalogError`:
 * a const-object error code enum, a structured issue interface, and
 * factory helpers.
 *
 * @module
 */

// ── Error codes ───────────────────────────────────────────────────────────

export const NetValidationCode = {
  // ── Structural errors ────────────────────────────────────────────────

  /** Net has zero node connections (floating). */
  NetFloating: 'NET_FLOATING',
  /** Two or more nets share the same name. */
  NetDuplicateName: 'NET_DUPLICATE_NAME',
  /** Two different nets connect to the same device pin. */
  NetAccidentalShort: 'NET_ACCIDENTAL_SHORT',

  // ── Missing topology ─────────────────────────────────────────────────

  /** No net with type=Power exists. */
  NetMissingPower: 'NET_MISSING_POWER',
  /** No net with type=Ground exists. */
  NetMissingGround: 'NET_MISSING_GROUND',
  /** A hierarchical port (Interface) has no matching net. */
  NetMissingHierarchicalPort: 'NET_MISSING_HIERARCHICAL_PORT',
  /** A required device pin has no net connection. */
  NetUnconnectedRequiredPin: 'NET_UNCONNECTED_REQUIRED_PIN',

  // ── Cross-sheet consistency ──────────────────────────────────────────

  /** Cross-sheet interface pin references don't match. */
  NetInconsistentCrossSheet: 'NET_INCONSISTENT_CROSS_SHEET',

  // ── Naming conventions ───────────────────────────────────────────────

  /** Net name violates analog/digital rail naming conventions. */
  NetNamingConvention: 'NET_NAMING_CONVENTION',
  /** Net associated with AC/high-voltage lacks protective naming. */
  NetProtectedDomain: 'NET_PROTECTED_DOMAIN',

  // ── Semantic ERC ─────────────────────────────────────────────────────

  /** Multiple actively-driven outputs or power sources are tied together. */
  NetOutputContention: 'NET_OUTPUT_CONTENTION',
  /** A signal net has inputs but no driver, pull, or passive source. */
  NetFloatingInput: 'NET_FLOATING_INPUT',
  /** A power rail has conflicting power sources/regulators. */
  NetPowerConflict: 'NET_POWER_CONFLICT',
  /** A signal net only connects passive pins and cannot be driven. */
  NetPassiveOnly: 'NET_PASSIVE_ONLY',
  /** A required power/ground pin is missing or connected to the wrong class of net. */
  NetUnpoweredDevice: 'NET_UNPOWERED_DEVICE',
  /** A device marked as requiring decoupling has no local capacitor across rail and ground. */
  NetMissingDecoupling: 'NET_MISSING_DECOUPLING',
  /** A pin expected voltage is incompatible with the connected net voltage. */
  NetVoltageMismatch: 'NET_VOLTAGE_MISMATCH',

  // ── General ──────────────────────────────────────────────────────────

  /** Validation could not be completed due to an internal error. */
  NetValidationInternal: 'NET_VALIDATION_INTERNAL',
} as const;

export type NetValidationCode = (typeof NetValidationCode)[keyof typeof NetValidationCode];

// ── Structured issue ──────────────────────────────────────────────────────

/**
 * A single net validation issue (error or warning).
 *
 * Mirrors `CircuitValidationError`'s shape but adds fields specific
 * to net/wire semantics: component ref, pin, net name, severity, and
 * a human-readable remediation hint.
 */
export interface NetValidationIssue {
  /** Machine-readable error code (e.g. "NET_FLOATING"). */
  code: NetValidationCode;
  /** Human-readable description of what is wrong. */
  message: string;
  /** Dot-notation path to the offending field (e.g. "nets[2]"). */
  path?: string;

  /** Whether this issue blocks validation (error) or is advisory (warning). */
  severity: 'error' | 'warning';
  /** Name of the offending net, if applicable. */
  netName?: string;
  /** Reference designator of the offending component, if applicable. */
  componentRef?: string;
  /** Pin number or name on the component, if applicable. */
  pin?: string;
  /** Actionable hint for the user on how to fix this issue. */
  remediationHint: string;

  /** Additional machine-readable context. */
  details?: Record<string, unknown>;
}

// ── Validation result ─────────────────────────────────────────────────────

export interface NetValidationResult {
  /** True when there are zero errors (warnings are allowed). */
  valid: boolean;
  /** Issues that block validation (catalog / circuit is invalid). */
  errors: NetValidationIssue[];
  /** Issues that are advisory (catalog / circuit is valid but should be reviewed). */
  warnings: NetValidationIssue[];
}

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * Create a single net validation issue.
 */
export function netValidationIssue(
  code: NetValidationCode,
  message: string,
  opts?: {
    severity?: 'error' | 'warning';
    path?: string;
    netName?: string;
    componentRef?: string;
    pin?: string;
    remediationHint?: string;
    details?: Record<string, unknown>;
  },
): NetValidationIssue {
  return {
    code,
    message,
    severity: opts?.severity ?? 'error',
    path: opts?.path,
    netName: opts?.netName,
    componentRef: opts?.componentRef,
    pin: opts?.pin,
    remediationHint: opts?.remediationHint ?? '',
    details: opts?.details,
  };
}

/**
 * Convenience: create an error-severity issue.
 */
export function netError(
  code: NetValidationCode,
  message: string,
  opts?: Omit<Parameters<typeof netValidationIssue>[2], 'severity'>,
): NetValidationIssue {
  return netValidationIssue(code, message, { ...opts, severity: 'error' });
}

/**
 * Convenience: create a warning-severity issue.
 */
export function netWarning(
  code: NetValidationCode,
  message: string,
  opts?: Omit<Parameters<typeof netValidationIssue>[2], 'severity'>,
): NetValidationIssue {
  return netValidationIssue(code, message, { ...opts, severity: 'warning' });
}
