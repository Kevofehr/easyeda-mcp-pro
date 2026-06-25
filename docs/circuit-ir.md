# CircuitIR & DesignIntent

## Overview

This document describes the **Circuit Intermediate Representation (CircuitIR)** and **DesignIntent** schema system used by easyeda-mcp-pro to model electronic designs in a structured, validated, and machine-readable format.

### Why two models?

| Model            | Purpose                                                       | Who writes it                                    | Status                      |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------ | --------------------------- |
| **DesignIntent** | High-level user requirements — _what_ the user wants to build | User or AI prompt                                | Free-form, validated        |
| **CircuitIR**    | Resolved, validated circuit model — _how_ it will be built    | Compiled from DesignIntent, or authored directly | Machine-verified, versioned |

The separation ensures that **user intent** (DesignIntent) is preserved as an audit trail, while **machine operations** (CircuitIR) work from a validated source of truth.

## DesignIntent

A DesignIntent captures the user's high-level requirements:

- Project name, goal, and board type
- Required functional blocks
- Electrical requirements (voltage, current, frequency)
- Power rail definitions (voltage, tolerance, current)
- Mechanical constraints (dimensions, layers, mounting)
- Manufacturing intent (volume, process, timeline)
- Safety/regulatory notes
- Explicit assumptions and acknowledged unknowns

### Schema

`schema: design-intent/v1`

```typescript
interface DesignIntent {
  $schema: 'design-intent/v1';
  project: {
    name: string; // e.g. "ESP32-S3 Sensor Board"
    goal: string; // natural language design goal
    boardType: BoardType; // power-supply | mcu-board | sensor-board | ac-dc-iot | hierarchical | custom
  };
  requirements: {
    functionalBlocks: FunctionalBlockReq[];
    electrical: { vinMin?; vinMax?; currentMaxAmps?; frequencyMaxHz?; notes? };
    power: { rails: PowerRailReq[] }; // at least one rail required
    mechanical: { widthMm?; heightMm?; layers?; mountingHoles?; notes? };
    manufacturing: { volume?; process?; timelineWeeks?; notes? };
    safety: { isolation?; certifications?; regulatory? };
  };
  assumptions: string[];
  unknowns: string[];
}
```

### Validation rules

- At least one functional block is required
- At least one power rail is required
- Project name must be non-empty
- Board type must be a valid `BoardType` enum value
- Extra fields are rejected via `strict()` mode

## CircuitIR

CircuitIR is the **validated, machine-readable source of truth** for downstream EasyEDA operations. It is produced by compiling a DesignIntent, but can also be authored or edited directly for advanced use cases.

`schema: circuit-ir/v1`

### Core node types

| Node                    | Description              | Key fields                                                                                |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| **Block**               | Functional subsystem     | `id`, `name`, `type`, `description`, `designIntentRef[]`, `children[]`                    |
| **Device**              | Component instance       | `id`, `ref`, `mpn`, `package`, `blockRef`, `designIntentRef[]`                            |
| **Net**                 | Electrical connection    | `id`, `name`, `type` (power/signal/ground), `nodes[]`, `blockRef`                         |
| **Rail**                | Power rail               | `id`, `name`, `voltage`, `tolerance`, `maxCurrent`, `sourceBlockRef`, `sinkBlockRefs[]`   |
| **PowerDomain**         | Voltage/current domain   | `id`, `name`, `nominalVoltage`, `railRefs[]`, `sourceRailRef`, `loadDeviceRefs[]`         |
| **SignalClass**         | Routing/electrical class | `id`, `name`, `kind`, `netNames[]`, `differentialPair`, `routing`                         |
| **PhysicalConstraint**  | Physical/layout rule     | `id`, `type`, `targetType`, `targetRef`, `description`, `minClearanceMm`, `preferredSide` |
| **Interface**           | External connector       | `id`, `name`, `type`, `pinout[]`, `blockRef`                                              |
| **Constraint**          | Design rule              | `id`, `type`, `severity`, `description`, `scope`                                          |
| **BOMIntent**           | BOM requirements         | `excludeRefs[]`, `preferredVendors[]`, `costTargetUsd`                                    |
| **PCBIntent**           | PCB constraints          | `layerCount`, `stackup`, `widthMm`, `heightMm`, `material`                                |
| **ManufacturingIntent** | Fab/assembly             | `quantity`, `process`, `timelineWeeks`                                                    |

### Cross-reference validation

CircuitIR enforces referential integrity:

- Every `NetNode.deviceRef` must reference a valid `Device.id`
- Every `Device.blockRef` must reference a valid `Block.id`
- Every `Device.powerDomainRef` must reference a valid `PowerDomain.id`
- Every `PowerDomain.railRefs[]` and `sourceRailRef` must reference valid `Rail.id` values
- Every `PowerDomain.loadDeviceRefs[]` item must reference a valid `Device.id`
- Every `Net.signalClassRef`, `Net.powerDomainRef`, and `Net.railRef` must resolve to known classes/domains/rails
- Every `SignalClass.netNames[]` and differential pair net must reference known `Net.name` values
- Every `PhysicalConstraint.targetRef` must resolve to the requested target type, except board-level constraints
- All IDs must be unique within their type

### Power domains, signal classes, and physical constraints

The expanded CircuitIR model lets an agent reason about professional electronics concerns before writing to EasyEDA:

- `powerDomains[]` groups rails, loads, nominal voltage, current budget, and isolation policy.
- `signalClasses[]` groups nets by electrical/routing behavior such as analog, digital, USB, RF, sensitive, high-speed, or differential.
- `physicalConstraints[]` expresses placement, clearance, creepage, height, thermal, keepout, accessibility, and testability requirements.

These objects are intentionally references, not EasyEDA primitives. They give the planner and rule engine enough structure to derive safe schematic, PCB, BOM, and manufacturing actions.

### Validation lifecycle

```
Draft → Validated → (consumed by EasyEDA tools)
Draft → Rejected   → (returned for revision)
```

## Compile Flow: DesignIntent → CircuitIR

```
User/AI ──► DesignIntent ──► Validate ──► Compile ──► CircuitIR(draft)
                                                         │
                                                    [Review Gate]
                                                         │
                                              ┌──────────┼──────────┐
                                              ▼          ▼          ▼
                                        Validated    Rejected    Draft
                                              │          │
                                              ▼          ▼
                                        EasyEDA     Return for
                                        Tools       Revision
```

### Compiler steps

1. **Validate** DesignIntent against the schema
2. **Transform** functional block requirements into `Block` nodes
3. **Create** `Rail` nodes from power rail requirements
4. **Stub** `Device` slots (one per block) — users fill in MPNs during planning
5. **Generate** placeholder `Net` entries for each power rail
6. **Copy** mechanical constraints into `pcb` fields
7. **Copy** manufacturing intent into `manufacturing` fields
8. **Validate** the output CircuitIR (structural + cross-reference checks)
9. Return draft CircuitIR + original DesignIntent (for traceability)

### Traceability model

Every `Block`, `Device`, `Net`, `Rail`, and `Constraint` carries a `designIntentRef[]` array that links back to one or more DesignIntent requirements:

```typescript
interface DesignIntentRef {
  requirementId: string; // e.g. "req-power-001"
  note?: string; // e.g. "Satisfies 3.3V rail requirement"
}
```

## Review Gate

Downstream EasyEDA **mutation tools** MUST check `isReadyForEasyEDA(circuitIR)` before applying changes. This function returns `true` only when `validationStatus === ValidationStatus.Validated`.

```typescript
import { isReadyForEasyEDA, setValidationStatus } from './circuit/compiler.js';
import { ValidationStatus } from './circuit/types.js';

// After human/AI review:
const validated = setValidationStatus(draftCir, ValidationStatus.Validated);

// Before EasyEDA operations:
if (!isReadyForEasyEDA(validated)) {
  throw new Error('CircuitIR must be validated before EasyEDA operations');
}
```

## Example: 12V-to-3.3V Power Supply Board

### DesignIntent

```json
{
  "$schema": "design-intent/v1",
  "project": {
    "name": "12V-to-3V3 Power Supply",
    "goal": "A regulated 3.3V power supply from a 12V input, delivering 500mA",
    "boardType": "power-supply"
  },
  "requirements": {
    "functionalBlocks": [
      {
        "id": "req-input",
        "name": "Input Protection",
        "type": "protection",
        "purpose": "Reverse polarity and over-current protection on 12V input"
      },
      {
        "id": "req-regulator",
        "name": "Voltage Regulator",
        "type": "power-management",
        "purpose": "12V to 3.3V step-down conversion at 500mA"
      }
    ],
    "power": {
      "rails": [
        { "id": "12V_IN", "voltage": 12.0, "maxCurrentAmps": 1.0 },
        { "id": "3V3_OUT", "voltage": 3.3, "tolerance": 3, "maxCurrentAmps": 0.5 }
      ]
    },
    "mechanical": { "widthMm": 30, "heightMm": 20, "layers": 2 }
  }
}
```

### Compiled CircuitIR (draft)

```json
{
  "$schema": "circuit-ir/v1",
  "metadata": {
    "validationStatus": "draft",
    "designIntentRef": "12V-to-3V3 Power Supply"
  },
  "blocks": [
    {
      "id": "block-req-input",
      "name": "Input Protection",
      "type": "protection",
      "designIntentRef": [{ "requirementId": "req-input" }]
    },
    {
      "id": "block-req-regulator",
      "name": "Voltage Regulator",
      "type": "power-management",
      "designIntentRef": [{ "requirementId": "req-regulator" }]
    }
  ],
  "devices": [
    {
      "id": "dev-block-req-input",
      "ref": "U?",
      "blockRef": "block-req-input",
      "designIntentRef": [{ "requirementId": "req-input" }]
    },
    {
      "id": "dev-block-req-regulator",
      "ref": "U?",
      "blockRef": "block-req-regulator",
      "designIntentRef": [{ "requirementId": "req-regulator" }]
    }
  ],
  "nets": [
    { "id": "net-rail-12V_IN", "name": "12V_IN", "type": "power", "nodes": [] },
    { "id": "net-rail-3V3_OUT", "name": "3V3_OUT", "type": "power", "nodes": [] }
  ],
  "rails": [
    {
      "id": "rail-12V_IN",
      "name": "12V_IN",
      "voltage": 12.0,
      "tolerance": 5,
      "maxCurrentAmps": 1.0,
      "designIntentRef": [{ "requirementId": "12V_IN" }]
    },
    {
      "id": "rail-3V3_OUT",
      "name": "3V3_OUT",
      "voltage": 3.3,
      "tolerance": 3,
      "maxCurrentAmps": 0.5,
      "designIntentRef": [{ "requirementId": "3V3_OUT" }]
    }
  ],
  "pcb": { "layerCount": 2, "widthMm": 30, "heightMm": 20 },
  "manufacturing": {}
}
```

## API Usage

```typescript
import { compile, isReadyForEasyEDA, setValidationStatus } from './circuit/compiler.js';
import { validateDesignIntent, isDesignIntent } from './circuit/design-intent.js';
import { validateCircuitIR, isCircuitIR } from './circuit/circuit-ir.js';
import { ValidationStatus, BoardType } from './circuit/types.js';

// 1. Parse user requirements
const intent = validateDesignIntent(rawUserInput);

// 2. Compile into CircuitIR (draft)
const { circuitIR, warnings } = compile(intent);

// 3. Review gate (human or automated)
const validated = setValidationStatus(circuitIR, ValidationStatus.Validated);

// 4. Check before EasyEDA operations
if (isReadyForEasyEDA(validated)) {
  // Proceed with schematic placement, wiring, etc.
}
```

## File Structure

```
src/circuit/
├── index.ts              # Public API surface
├── types.ts              # Enums and shared types
├── errors.ts             # Circuit-specific error types
├── design-intent.ts      # DesignIntent schema + validation
├── circuit-ir.ts         # CircuitIR schema + validation
└── compiler.ts           # DesignIntent → CircuitIR compiler

tests/unit/circuit/
├── design-intent.test.ts # DesignIntent validation tests
├── circuit-ir.test.ts    # CircuitIR validation tests
└── compiler.test.ts      # Compiler + review gate tests
```
