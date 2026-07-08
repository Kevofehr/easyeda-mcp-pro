# Schematic & PCB Style Guide (living document)

Last updated: 2026-07-08 (skeleton created; fill in over time)

This is the house style for producing clean, readable schematics and well-formed
PCBs through `easyeda-mcp-pro`. It is a LIVING document: it starts as a skeleton
and gets better every project. The goal is that recurring corrections are captured
here once, so the agent stops repeating them and there is less to fix next time.

The agent can read the current version at any time via the MCP resource
`easyeda://guide/style` (served live from this file - edits here take effect with
no rebuild).

---

## Section 0 - Agent protocol (READ FIRST, every session)

Before authoring or modifying any schematic or PCB:

1. **Load this guide** (`easyeda://guide/style`) and follow it. Treat the rules
   here as requirements, not suggestions.
2. When a rule here conflicts with a one-off user instruction, the **user's
   instruction wins for this project**; note the deviation in Section 5.
3. **After the user corrects your output**, capture the correction:
   - Add a concrete, imperative rule to the relevant section below.
   - Add a one-line entry to the Correction Log (Section 6, newest on top).
   - Keep it short and specific ("route power before signal", not an essay).
   This is the whole point - a correction should only have to happen once.
4. If you are unsure whether something is house style, ASK, then record the
   answer here so the question does not come up again.

> Maintainer note: the highest-leverage next step is to reference this guide from
> the authoring tool descriptions (schematic/PCB write tools) and/or the server
> `instructions` so it is always in front of the agent. Left as a follow-up.

---

## Section 1 - General principles (clean by default)

- TBD - overarching principles (readability first, consistency over cleverness,
  match existing project conventions before inventing new ones).
- Parts selection follows the LCSC-first, stock-checked rule (record the LCSC C#
  at selection time, prefer JLC Basic, verify stock before committing). See the
  user's global PCB rules and the PCB SOPs.
- TBD

## Section 2 - Schematic conventions

### 2.1 Sheet layout & signal flow
- TBD - flow direction (inputs left, outputs right; power top, ground bottom).
- TBD - one functional block per region; group related parts.

### 2.2 Nets, labels & buses
- TBD - net naming scheme (case, prefixes, power net names like +3V3, GND).
- TBD - when to use net labels vs wires vs net ports; avoid ambiguous auto-names.

### 2.3 Power & ground
- TBD - power flag / net-port conventions; single ground symbol style.
- TBD - decoupling placement shown near the pin it serves.

### 2.4 Component placement & symbols
- TBD - grid snap; no overlapping symbols; consistent rotation.
- TBD - designator + value visible and not colliding with wires.

### 2.5 Annotation, designators & values
- TBD - designator scheme; value/footprint/LCSC populated at placement time.

### 2.6 Readability checklist (before considering a sheet "done")
- TBD - no crossed wires where avoidable, no dangling ends, no off-grid parts,
  consistent text size, title block filled.

## Section 3 - PCB layout conventions

### 3.1 Board setup (units, origin, stackup)
- TBD - working units, origin placement, layer count / stackup defaults.

### 3.2 Placement strategy
- TBD - place connectors/mechanical first, then power, then by signal group.
- TBD - decoupling caps adjacent to their IC power pins.

### 3.3 Routing (widths, vias, angles)
- TBD - default track widths by net class (signal / power / high-current).
- TBD - via sizes; no acute angles; teardrop policy.

### 3.4 Power & ground / planes
- TBD - plane usage, stitching, return paths.

### 3.5 Clearances & design rules
- TBD - default DRC ruleset; clearances; annular ring minimums.
- Cross-check against manufacturer capabilities (JLCPCB/PCBWay) before finalizing.

### 3.6 Silkscreen & assembly
- TBD - reference designator size/orientation; polarity/pin-1 markers; no silk on
  pads. See PCB authoring gotchas for bottom-silk mirroring behavior.

### 3.7 Thermal & mechanical
- TBD - thermal relief, copper pours, mounting hole keepouts.

## Section 4 - Naming & metadata conventions

- TBD - project/sheet naming, net-class names, layer names.
- LCSC part number recorded on every placed part (LCSC-first rule).

## Section 5 - Project-specific overrides

Deviations from this guide that apply only to a specific project. Record the
project and the reason so they are not mistaken for house style.

| Project | Override | Reason | Date |
| ------- | -------- | ------ | ---- |
| (example) | (what differs) | (why) | (yyyy-mm-dd) |

## Section 6 - Correction log (append newest on top)

Each row is a correction that became a rule. Keep it terse.

| Date | Context (sch/pcb) | What was wrong | Rule going forward | Where captured |
| ---- | ----------------- | -------------- | ------------------ | -------------- |
| (yyyy-mm-dd) | (example) | (what the agent did) | (the fix) | (section #) |

---

## Related references (links)

- `docs/reference/pcb-authoring-gotchas.md` - concrete EasyEDA authoring gotchas
  (units, bottom-silk rotation, cutouts).
- `docs/pcb-sops/PCB Design SOP.md` and the rest of `docs/pcb-sops/` - the broader
  design and manufacturing SOP set.
- User global rule: LCSC-first, stock-checked part selection.
