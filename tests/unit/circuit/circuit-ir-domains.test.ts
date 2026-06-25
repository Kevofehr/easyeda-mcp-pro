import { describe, expect, it } from 'vitest';
import { CIRCUIT_IR_SCHEMA_VERSION, CircuitIRSchema } from '../../../src/circuit/circuit-ir.js';
import { ConstraintSeverity, NetType, ValidationStatus } from '../../../src/circuit/types.js';

const baseCircuit = {
  $schema: CIRCUIT_IR_SCHEMA_VERSION,
  metadata: {
    version: '1.0.0',
    validationStatus: ValidationStatus.Draft,
  },
  blocks: [{ id: 'block-power', name: 'Power', type: 'power-management' }],
  devices: [
    {
      id: 'dev-u1',
      ref: 'U1',
      blockRef: 'block-power',
      powerDomainRef: 'pd-3v3',
      placementZoneRef: 'zone-digital',
      estimatedDissipationWatts: 0.25,
    },
  ],
  nets: [
    {
      id: 'net-3v3',
      name: '3V3',
      type: NetType.Power,
      powerDomainRef: 'pd-3v3',
      signalClassRef: 'sc-power',
      railRef: 'rail-3v3',
    },
    {
      id: 'net-usb-dp',
      name: 'USB_DP',
      type: NetType.Signal,
      signalClassRef: 'sc-usb',
    },
    {
      id: 'net-usb-dn',
      name: 'USB_DN',
      type: NetType.Signal,
      signalClassRef: 'sc-usb',
    },
  ],
  rails: [
    {
      id: 'rail-3v3',
      name: '3V3',
      voltage: 3.3,
      tolerance: 5,
      maxCurrentAmps: 1,
    },
  ],
  powerDomains: [
    {
      id: 'pd-3v3',
      name: '3.3V digital domain',
      nominalVoltage: 3.3,
      railRefs: ['rail-3v3'],
      sourceRailRef: 'rail-3v3',
      loadDeviceRefs: ['dev-u1'],
      maxCurrentAmps: 1,
    },
  ],
  signalClasses: [
    {
      id: 'sc-power',
      name: 'Power nets',
      kind: 'power',
      netNames: ['3V3'],
      routing: { traceWidthMm: 0.5, clearanceMm: 0.2 },
    },
    {
      id: 'sc-usb',
      name: 'USB differential pair',
      kind: 'usb',
      netNames: ['USB_DP', 'USB_DN'],
      differentialPair: {
        positiveNet: 'USB_DP',
        negativeNet: 'USB_DN',
        targetImpedanceOhms: 90,
        lengthMatchToleranceMm: 0.15,
      },
      routing: { preferredLayer: 'top', returnPathNet: 'GND' },
    },
  ],
  physicalConstraints: [
    {
      id: 'pc-u1-height',
      type: 'height',
      severity: ConstraintSeverity.Required,
      targetType: 'device',
      targetRef: 'dev-u1',
      description: 'U1 must fit under enclosure lid.',
      value: 4,
      unit: 'mm',
    },
  ],
  interfaces: [],
  constraints: [],
  bom: { excludeRefs: [], preferredVendors: [] },
  pcb: {},
  manufacturing: {},
};

describe('CircuitIR power domains, signal classes, and physical constraints', () => {
  it('accepts resolved domain/class/physical constraint references', () => {
    const result = CircuitIRSchema.safeParse(baseCircuit);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.powerDomains).toHaveLength(1);
    expect(result.data.signalClasses).toHaveLength(2);
    expect(result.data.physicalConstraints).toHaveLength(1);
    expect(result.data.devices[0]?.powerDomainRef).toBe('pd-3v3');
    expect(result.data.nets[0]?.signalClassRef).toBe('sc-power');
  });

  it('rejects unresolved power-domain rail references', () => {
    const invalid = {
      ...baseCircuit,
      powerDomains: [{ ...baseCircuit.powerDomains[0], sourceRailRef: 'rail-missing' }],
    };

    expect(CircuitIRSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unresolved device power-domain references', () => {
    const invalid = {
      ...baseCircuit,
      devices: [{ ...baseCircuit.devices[0], powerDomainRef: 'pd-missing' }],
    };

    expect(CircuitIRSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects signal classes that reference missing nets', () => {
    const invalid = {
      ...baseCircuit,
      signalClasses: [{ ...baseCircuit.signalClasses[0], netNames: ['MISSING_NET'] }],
    };

    expect(CircuitIRSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects physical constraints that target missing devices', () => {
    const invalid = {
      ...baseCircuit,
      physicalConstraints: [{ ...baseCircuit.physicalConstraints[0], targetRef: 'dev-missing' }],
    };

    expect(CircuitIRSchema.safeParse(invalid).success).toBe(false);
  });
});
