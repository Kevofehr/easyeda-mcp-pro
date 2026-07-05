# PCB SOPs

A set of focused SOPs and reference docs for designing and manufacturing printed circuit boards, so each topic can go deep and stay searchable. Industry standards, best practices, and tool-specific tips, with concrete numbers and cited sources.

Last updated: 2026-07-04.

---

## What's in this folder

| File | Use it for |
|---|---|
| **PCB Design SOP** | How to design a good board: schematic capture, layout, grounding/decoupling/EMI with real numbers, reference-designator and naming standards, and the full pre-fab/review checklist. The flagship doc. |
| **PCB Manufacturing & Assembly SOP** | Taking a finished design to fab: deliverables (Gerbers/drill/BOM/CPL), what to specify, recommended stackups, DFM/DFA checklist, panelization, ordering workflow, and bring-up. |
| **Flex & Rigid-Flex PCB SOP** | Designing and building flexible (FPC) and rigid-flex boards: materials/stackups, bend-radius and bend-zone routing rules, IPC standards, failure modes, the full JLCPCB flex capabilities/rules/ordering flow, the EasyEDA Pro FPC + stiffener workflow, and a cross-tool comparison. Key facts: JLCPCB builds flex (1/2/4 layer) but NOT true rigid-flex; model rigid zones with stiffeners. |
| **PCB Vendor Reference List** | Where to get boards built: a tiered, verified directory of fab/assembly vendors (US + overseas), a quick decision guide, and what to send a fab. |
| **ECAD Tools & Commands Quick-Reference** | The command/shortcut cheat-sheet: tscircuit + KiCad (+ ngspice, kicad-cli), with EasyEDA and Flux.ai as alternatives. Plus gerber viewers and a cross-tool fab checklist. |
| **tscircuit Deep Reference** | Full tscircuit guide: the model, the complete `tsci` CLI, authoring syntax, footprints, autorouting, fab outputs, native ngspice SPICE, eval/registry, and KiCad interop. |
| **PCB Resource Library** | The searchable link index: standards, design guides, app notes by topic, calculators, tool docs, gerber viewers, and the community review wikis. |

---

## The default workflow (the short version)

1. **Research** the parts and problem (latest datasheets, app notes, errata, reference designs).
2. **Plan and validate the architecture** (interfaces, connections, part compatibility, open questions). Do not jump to ECAD while the design is only stubbed.
3. **Schematic** -> **Layout** in your ECAD of choice (tscircuit, KiCad, EasyEDA), with ngspice for analog sim and kicad-cli for headless fab output where applicable. See the Design SOP + Tools reference.
4. **Self-review** against the Design SOP checklist, run DRC/ERC against the fab's spec, and inspect Gerbers in an independent viewer.
5. **Fab + assemble** (Manufacturing SOP). Sensible default: prototype on JLCPCB; PCBWay for HDI/rigid-flex; MacroFab/CircuitHub/Advanced Circuits/Sierra for US-made/ITAR.

Default fab specs: 4-layer, 1.6 mm, 1 oz copper, ENIG (or HASL for cheap protos), green mask, controlled impedance only when needed.

---

## House style for these docs

No emojis or em dashes (use hyphens, commas, parentheses). No YAML frontmatter. Keep numbers concrete and cite sources. These are living documents - re-verify point-in-time facts (vendor capabilities, tool commands, standards) before relying on them.
