# MCP Improvement Backlog (live-session gaps)

Capability gaps hit during real design work (Maker Chip 3-board stack,
2026-07-06 session). Each item is something the bridge/MCP **could not do**
and the workaround used, so it doubles as a spec for the fix. Ordered by
how much manual GUI work the gap forces.

## 1. Schematic↔PCB relink / "Update PCB" (the big one)

**Gap:** there is no working bridge path to (re)link a manually-placed PCB
component to its schematic counterpart.

- `PCB_Document.importChanges()` reliably **times out the bridge** (>15s
  heavy netlist rebuild → "connection replaced by a new client" → EasyEDA
  rolls the import back). Known since the ATtiny1616 swap; reconfirmed.
- The link key (component **Unique ID**, `gge*`) is half-visible:
  `sch_PrimitiveAttribute` lists `Unique ID` values but with empty
  `parentId`, and `pcb_PrimitiveAttribute` exposes **no** Unique ID rows at
  all, so the link can be neither read nor written from the API.

**Consequence:** after any API-side component swap the user must run GUI
**Design → Update PCB** by hand, and the import may drop the API-placed part
off-board (re-apply position after).

**Fix ideas:** (a) chunk/async-ify `importChanges` behind a long-poll job so
the 15s WS timeout doesn't kill it; (b) expose component Unique ID
read/write on both documents so a `relink_component` tool can set the PCB
side's ID to match the schematic and skip import entirely.

## 2. Netlist reads are all broken or lethal

| API                                                                        | Result                           |
| -------------------------------------------------------------------------- | -------------------------------- |
| `sch_Netlist.getNetlist()`                                                 | **times out the bridge** (heavy) |
| `sch_Net.getAllNetsName()` / `getCurrentProjectAllNets()` / `getNet(name)` | return empty/undefined           |
| `easyeda_schematic_nets` tool                                              | returns `[]`                     |
| `easyeda_export_netlist` tool                                              | `not_available`                  |

**Workaround used:** reconstruct connectivity geometrically. Wires carry
`net` only when explicitly labeled; net ports are `sch_PrimitiveComponent`s
with `componentType: "netport"` and the net in `.net`; match wire endpoint
coordinates to symbol pin coordinates (from
`easyeda_schematic_component_pins`, which **does** work).

**Fix idea:** a `schematic_connectivity` tool that does exactly that
reconstruction server-side (pins + wires + netports + netflags → net map).
Note `pcb_Net.getNetlist()` _works_ and returns an array with the stored
netlist of **every** board in the project (index order = board order), which
is useful ground truth for the PCB side.

## 3. `easyeda_drc_run` is a no-op

Returns `{passed: false, not_available: true}` while the raw API works fine.
Wire it to `eda.pcb_Drc.check(true, false, true)` and parse the grouped tree
(`group → rule → errors`, detail in `err.explanation.errData` including both
primitive IDs, nets, position, and required clearance). Same for
`easyeda_export_netlist` (gap 2).

## 4. `easyeda_pcb_add_pad` unit + solder-mask footguns

- Takes **raw mil** for `x/y/width/height` while most other tools take mm.
  a pad requested at `(0, 8.15)` landed at `(0, 0.207mm)` with a 1.5-mil pad.
- Defaults `solderMaskAndPasteMaskExpansion` to ~0 (`0.002`) instead of the
  editor default `0.2`, silently making a pad with no usable mask relief.

**Fix:** accept mm (or an explicit `units` param) and default mask expansion
to 0.2. Until then: create, then `modify` with `mmToMil()` values and an
explicit mask block.

## 5. No re-net tool (the `modify({net})` quirk)

`modify({net})` leaves the persisted connection graph stale → phantom
"No Connection" DRC errors that survive document reload. Full write-up in
`pcb-authoring-gotchas.md`. The MCP should ship
`easyeda_pcb_renet_primitive` that internally does create-with-net → verify →
delete-old, so callers never touch raw `modify({net})`.

## 6. Document switching & timing

- `dmt_EditorControl.openDocument(uuid)` needs the **schematic page uuid**
  (from `getAllSchematicsInfo().page[].uuid`), not the schematic uuid. The
  latter silently leaves the previous document active.
- Reads immediately after `openDocument` fail
  ("获取所有器件的图元ID失败"). It needs a ~1.5–2.5s settle before the first
  `getAllPrimitiveId()`.

**Fix:** an MCP `open_document` tool that resolves schematic→page uuid and
polls until primitives are readable.

## 7. Misc read-side paper cuts

- `pcb_PrimitiveComponent.get()` returns attribute _templates_
  (`"={Manufacturer Part}"`) instead of resolved designators, and sometimes
  empty-keys objects right after another op; rotation can misreport
  (a 45°-placed QFN read back as 135 / −150 on other parts). Positions are
  only trustworthy via the component's **pads**.
- `sch_PrimitivePin.getAllPrimitiveId()` returns 0. Pins are not standalone
  primitives (use `easyeda_schematic_component_pins`).
- `dmt_EditorControl.getCurrentRenderedAreaImage()` returns a Blob that
  serializes to `{}`. It must `await img.arrayBuffer()` → base64 chunks; a
  proper `render_board_png` tool would hide this (and the >token-limit
  file-spill dance).

## Prioritization suggestion

1 and 2 remove the last **mandatory GUI steps** in an otherwise fully
scripted flow; 3–5 are correctness footguns that produced real (phantom or
silent) defects this session; 6–7 are ergonomics.
