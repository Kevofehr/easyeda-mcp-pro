/**
 * Net validation — wire-name and topology validation rules.
 *
 * Implements 10 validation rules that operate on {@link NetValidationInput}
 * and produce structured {@link NetValidationIssue}s.
 *
 * Rules:
 *  1. Floating net (zero nodes)
 *  2. Duplicate net names
 *  3. Accidental short (same device pin on different nets)
 *  4. Missing power net
 *  5. Missing ground net
 *  6. Missing hierarchical port
 *  7. Unconnected required pin
 *  8. Inconsistent cross-sheet interface pins
 *  9. Naming convention violation (domain mismatch)
 * 10. Protected AC/high-voltage domain naming
 *
 * @module
 */

import { NetValidationCode, NetValidationResult, netError, netWarning } from './errors.js';
import {
  NET_DOMAIN_PATTERNS,
  NET_TYPE_EXPECTED_DOMAIN,
  REQUIRED_GROUND_NETS,
  REQUIRED_POWER_NETS,
  RESERVED_NET_NAMES,
  NetDomain,
} from './schema.js';
import type { InterfaceValidationEntry, NetValidationInput, NetValidationEntry } from './schema.js';
import type { NetValidationIssue } from './errors.js';

// ── Rule: floating nets ────────────────────────────────────────────────────

function checkFloatingNets(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  for (const net of input.nets) {
    if (net.nodes.length === 0) {
      issues.push(
        netError(
          NetValidationCode.NetFloating,
          `Net "${net.name}" (${net.id}) has no node connections — it is floating`,
          {
            path: `nets[${input.nets.indexOf(net)}]`,
            netName: net.name,
            remediationHint: 'Connect this net to at least one device pin or remove it',
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: duplicate net names ──────────────────────────────────────────────

function checkDuplicateNetNames(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];
  const nameMap = new Map<string, NetValidationEntry[]>();

  for (const net of input.nets) {
    const normalised = net.name.toUpperCase();
    const existing = nameMap.get(normalised) ?? [];
    existing.push(net);
    nameMap.set(normalised, existing);
  }

  for (const [name, nets] of nameMap) {
    if (nets.length > 1) {
      const ids = nets.map((n) => n.id).join(', ');
      issues.push(
        netError(
          NetValidationCode.NetDuplicateName,
          `Net name "${name}" is used by ${nets.length} nets: ${ids}`,
          {
            netName: name,
            remediationHint:
              'Rename conflicting nets or merge them if they are intended to be the same electrical node',
            details: { matchingNetIds: nets.map((n) => n.id) },
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: accidental shorts ────────────────────────────────────────────────

function checkAccidentalShorts(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];
  const pinToNets = new Map<string, NetValidationEntry[]>();

  for (const net of input.nets) {
    for (const node of net.nodes) {
      const key = `${node.deviceRef}:${node.pin}`;
      const existing = pinToNets.get(key) ?? [];
      existing.push(net);
      pinToNets.set(key, existing);
    }
  }

  for (const [key, nets] of pinToNets) {
    if (nets.length > 1) {
      const parts = key.split(':');
      issues.push(
        netError(
          NetValidationCode.NetAccidentalShort,
          `Device pin "${key}" is connected to ${nets.length} different nets: ${nets.map((n) => n.name).join(', ')}`,
          {
            componentRef: parts[0],
            pin: parts[1],
            remediationHint:
              'Ensure only one net connects to each device pin, or use a net junction if intentional',
            details: {
              conflictingNets: nets.map((n) => ({ id: n.id, name: n.name })),
            },
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: missing power net ────────────────────────────────────────────────

function checkMissingPowerNet(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  // Check that at least one net has type=power
  const powerNets = input.nets.filter((n) => n.type === 'power');
  if (powerNets.length === 0) {
    issues.push(
      netError(
        NetValidationCode.NetMissingPower,
        'No power net found — the design must have at least one net of type=power',
        {
          remediationHint: 'Add a power net (e.g. "3V3", "VIN", "VCC") with type="power"',
        },
      ),
    );
  }

  // Also check for required specific power net names
  for (const required of REQUIRED_POWER_NETS) {
    const found = input.nets.some((n) => n.name.toUpperCase() === required.toUpperCase());
    if (!found) {
      issues.push(
        netWarning(
          NetValidationCode.NetMissingPower,
          `Required power net "${required}" not found in the design`,
          {
            netName: required,
            remediationHint: `Add a "${required}" power rail or ensure your power source is properly named`,
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: missing ground net ───────────────────────────────────────────────

function checkMissingGroundNet(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  const groundNets = input.nets.filter((n) => n.type === 'ground');
  if (groundNets.length === 0) {
    issues.push(
      netError(
        NetValidationCode.NetMissingGround,
        'No ground net found — the design must have at least one net of type=ground',
        {
          remediationHint: 'Add a ground net (e.g. "GND") with type="ground"',
        },
      ),
    );
  }

  // Also check for required specific ground net names
  for (const required of REQUIRED_GROUND_NETS) {
    const found = input.nets.some((n) => n.name.toUpperCase() === required.toUpperCase());
    if (!found) {
      issues.push(
        netWarning(
          NetValidationCode.NetMissingGround,
          `Required ground net "${required}" not found in the design`,
          {
            netName: required,
            remediationHint: `Add a "${required}" net with type="ground"`,
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: missing hierarchical port ────────────────────────────────────────

function checkMissingHierarchicalPorts(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  if (!input.interfaces || input.interfaces.length === 0) {
    return issues; // No interfaces defined — skip
  }

  const netNames = new Set(input.nets.map((n) => n.name.toUpperCase()));

  for (const intf of input.interfaces) {
    for (const pinEntry of intf.pinout) {
      if (!netNames.has(pinEntry.signal.toUpperCase())) {
        issues.push(
          netError(
            NetValidationCode.NetMissingHierarchicalPort,
            `Interface "${intf.name}" references signal "${pinEntry.signal}" (pin ${pinEntry.pin}) but no matching net was found`,
            {
              netName: pinEntry.signal,
              pin: pinEntry.pin,
              remediationHint: `Add a net named "${pinEntry.signal}" or update the interface pinout`,
              details: { interfaceName: intf.name },
            },
          ),
        );
      }
    }
  }

  return issues;
}

// ── Rule: unconnected required pins ────────────────────────────────────────

function checkUnconnectedPins(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  if (!input.devices || input.devices.length === 0) {
    return issues;
  }

  // Build set of connected pins
  const connectedPins = new Set<string>();
  for (const net of input.nets) {
    for (const node of net.nodes) {
      connectedPins.add(`${node.deviceRef}:${node.pin}`);
    }
  }

  // Check each device for unconnected pins
  // For now, only flag devices with no connections at all (not individual pins,
  // since we don't have a comprehensive required-pin list per device category)
  for (const device of input.devices) {
    const devicePins = [...connectedPins].filter((p) => p.startsWith(`${device.id}:`));
    if (devicePins.length === 0) {
      issues.push(
        netWarning(
          NetValidationCode.NetUnconnectedRequiredPin,
          `Device "${device.ref}" (${device.id}) has no pin connections`,
          {
            componentRef: device.ref,
            remediationHint:
              'Connect at least one pin of this device to a net, or remove it if unused',
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: inconsistent cross-sheet interfaces ──────────────────────────────

function checkCrossSheetConsistency(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  if (!input.interfaces || input.interfaces.length < 2) {
    return issues; // Need at least 2 interfaces to compare
  }

  // For cross-sheet validation, interfaces with the same name on different
  // sheets should have matching pinout lists
  const byName = new Map<string, typeof input.interfaces>();
  for (const intf of input.interfaces) {
    const key = intf.name.toUpperCase();
    const existing = byName.get(key) ?? [];
    existing.push(intf);
    byName.set(key, existing);
  }

  for (const [name, group] of byName) {
    if (group.length < 2) continue;

    // Compare all interfaces with the same name (group.length >= 2 here)
    const [reference, ...others] = group as [
      InterfaceValidationEntry,
      ...InterfaceValidationEntry[],
    ];

    for (const [index, other] of others.entries()) {
      const instanceNumber = index + 2;

      // Check pin count matches
      if (reference.pinout.length !== other.pinout.length) {
        issues.push(
          netError(
            NetValidationCode.NetInconsistentCrossSheet,
            `Interface "${name}" has inconsistent pin counts: sheet 1 has ${reference.pinout.length} pins, sheet ${instanceNumber} has ${other.pinout.length} pins`,
            {
              remediationHint: 'Ensure all instances of this interface have the same pinout',
              details: {
                interfaceName: name,
                firstInstanceId: reference.id,
                otherInstanceId: other.id,
              },
            },
          ),
        );
        continue;
      }

      // Check individual pin names match
      for (const [j, refPin] of reference.pinout.entries()) {
        const otherPin = other.pinout[j];
        if (otherPin === undefined) continue;
        if (refPin.signal.toUpperCase() !== otherPin.signal.toUpperCase()) {
          issues.push(
            netError(
              NetValidationCode.NetInconsistentCrossSheet,
              `Interface "${name}" has mismatched signals at index ${j}: "${refPin.signal}" vs "${otherPin.signal}"`,
              {
                pin: refPin.pin,
                remediationHint: 'Update the interface pinout to match across all sheets',
                details: {
                  interfaceName: name,
                  expectedSignal: refPin.signal,
                  actualSignal: otherPin.signal,
                },
              },
            ),
          );
        }
      }
    }
  }

  return issues;
}

// ── Rule: naming convention violations ─────────────────────────────────────

/**
 * Classify a net name into one or more {@link NetDomain}s.
 */
function classifyNetDomain(name: string): Set<NetDomain> {
  const domains = new Set<NetDomain>();

  for (const [domain, patterns] of Object.entries(NET_DOMAIN_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(name)) {
        domains.add(domain as NetDomain);
        break; // One match per domain is enough
      }
    }
  }

  return domains;
}

function checkNamingConventions(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  for (const net of input.nets) {
    const name = net.name;

    // Skip reserved names (GND, VCC, etc.) — these are convention by definition
    if (RESERVED_NET_NAMES.has(name.toUpperCase())) continue;

    // Get expected domain for this net's type
    const expectedDomains = NET_TYPE_EXPECTED_DOMAIN[net.type];
    if (!expectedDomains) continue;

    // Classify the net name
    const actualDomains = classifyNetDomain(name);

    // If the net type is power, the name should look like a power rail
    if (net.type === 'power' && !actualDomains.has(NetDomain.Power)) {
      issues.push(
        netWarning(
          NetValidationCode.NetNamingConvention,
          `Power net "${name}" does not follow power rail naming conventions (e.g. "3V3", "VCC", "VIN")`,
          {
            netName: name,
            remediationHint:
              'Rename to a conventional power rail name like "VCC", "3V3", or "VIN_5V"',
          },
        ),
      );
    }

    // If the net type is ground, the name should look like a ground
    if (net.type === 'ground' && !actualDomains.has(NetDomain.Ground)) {
      issues.push(
        netWarning(
          NetValidationCode.NetNamingConvention,
          `Ground net "${name}" does not follow ground naming conventions (e.g. "GND", "AGND", "PGND")`,
          {
            netName: name,
            remediationHint: 'Rename to a conventional ground name like "GND", "AGND", or "PGND"',
          },
        ),
      );
    }

    // Check for AC/high-voltage naming without protection (next rule handles this more specifically)
  }

  return issues;
}

// ── Rule: protected AC/high-voltage domain ─────────────────────────────────

function checkProtectedDomain(input: NetValidationInput): NetValidationIssue[] {
  const issues: NetValidationIssue[] = [];

  for (const net of input.nets) {
    const actualDomains = classifyNetDomain(net.name);

    // If the net name suggests high-voltage domain, it should have clear
    // protective labeling
    if (actualDomains.has(NetDomain.HighVoltage)) {
      // High-voltage nets should not be named generically
      if (/^[A-Z]?[0-9]?$/.test(net.name.trim())) {
        issues.push(
          netError(
            NetValidationCode.NetProtectedDomain,
            `Net "${net.name}" appears to be in the high-voltage domain but has a generic name — use protective naming like "HV_*" or "AC_*"`,
            {
              netName: net.name,
              remediationHint:
                'Prefix the net name with "HV_" or "AC_" to clearly indicate high-voltage domain (e.g. "HV_BULK", "AC_L")',
            },
          ),
        );
      }

      // High-voltage nets should not be mixed with low-voltage signal naming
      if (actualDomains.has(NetDomain.Digital) || actualDomains.has(NetDomain.Clock)) {
        issues.push(
          netError(
            NetValidationCode.NetProtectedDomain,
            `Net "${net.name}" is classified as both high-voltage and digital/clock — this is a safety hazard`,
            {
              netName: net.name,
              remediationHint:
                'Separate high-voltage and low-voltage domains; use isolated net names with "HV_" prefix',
              details: { detectedDomains: [...actualDomains] },
            },
          ),
        );
      }
    }
  }

  return issues;
}

// ── Combine helper ─────────────────────────────────────────────────────────

type RuleFn = (input: NetValidationInput) => NetValidationIssue[];

const RULES: RuleFn[] = [
  checkFloatingNets,
  checkDuplicateNetNames,
  checkAccidentalShorts,
  checkMissingPowerNet,
  checkMissingGroundNet,
  checkMissingHierarchicalPorts,
  checkUnconnectedPins,
  checkCrossSheetConsistency,
  checkNamingConventions,
  checkProtectedDomain,
];

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Run all net validation rules against an input net list.
 *
 * Orchestrates 10 rules:
 *  1. Floating nets            — error if net has zero nodes
 *  2. Duplicate names          — error if multiple nets share a name
 *  3. Accidental shorts        — error if one device pin belongs to multiple nets
 *  4. Missing power            — error if no type=power net + warnings for specific names
 *  5. Missing ground           — error if no type=ground net + warnings for specific names
 *  6. Missing hierarchical port — error if interface references an unknown net
 *  7. Unconnected required pins — warning if a device has zero connections
 *  8. Cross-sheet consistency   — error if same-name interfaces have different pinouts
 *  9. Naming convention         — warning if power/ground nets have non-standard names
 * 10. Protected domain          — error if high-voltage net lacks protective naming
 */
export function validateNets(input: NetValidationInput): NetValidationResult {
  const errors: NetValidationIssue[] = [];
  const warnings: NetValidationIssue[] = [];

  for (const rule of RULES) {
    const issues = rule(input);
    for (const issue of issues) {
      if (issue.severity === 'error') {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate nets and throw on the first error.
 *
 * Returns the full result on success. Throws the first `NetValidationIssue`
 * found (as an error) if validation fails.
 */
export function validateNetsOrThrow(input: NetValidationInput): NetValidationResult {
  const result = validateNets(input);
  if (!result.valid) {
    throw result.errors[0];
  }
  return result;
}
