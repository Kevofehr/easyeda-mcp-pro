# ECAD Tools & Commands Quick-Reference

A practical cheat-sheet for common ECAD tools: the key commands, CLI, keyboard shortcuts, and "how do I do X" recipes an engineer or AI agent reaches for.

**Sections 1-2 cover a tscircuit (code-to-PCB) + KiCad 9 stack, with ngspice for analog sim and kicad-cli for headless fab output.** **EasyEDA and Flux.ai (sections 3-4) are situational ALTERNATIVES** - handy for one-click JLCPCB ordering (EasyEDA) or AI-assisted review/FMEA (Flux).

> Verification note: tscircuit commands/syntax are pulled from the official tscircuit skill (https://github.com/tscircuit/skill). KiCad, EasyEDA, Flux, and gerber-viewer items are verified against official docs (links inline). A few app shortcuts are version- or theme-dependent and are flagged "verify in-app". KiCad's full live hotkey list is always available with **Ctrl+F1** inside any editor.

---

## 1. tscircuit (`tsci`)

React/TypeScript code-to-PCB. Circuits are `.circuit.tsx` files that default-export a function returning JSX (`<board>...`). Build outputs land in `dist/`.

### Prereqs / gotchas
- Needs **Node.js or Bun**. Note: on some Windows installs the `tsci` shim is hardcoded to **bun** (node fallback absent) - keep Bun installed if you hit that.
- Install CLI: `npm install -g tscircuit` (or `bun install --global tscircuit`).
- Numbers in props = millimeters; strings can carry units (`"0.1in"`, `"2.54mm"`).
- Net names must start with a letter/underscore (letters, numbers, `_` only). Pin labels may start with a number (`"3V3"`).
- For AI-driven iteration prefer `tsci build` over `tsci dev`; DRC errors can usually be ignored during development - fix connectivity and placement first.

### CLI commands

| Command | What it does | Example |
|---|---|---|
| `tsci init` / `tsci init -y` | Bootstrap a project (interactive / accept defaults). Creates `index.circuit.tsx`, `package.json`, `tsconfig.json`, `tscircuit.config.json` | `tsci init -y` |
| `tsci dev` | Local interactive preview server (commonly `https://localhost:3020`); use the export UI here for the fab zip | `tsci dev` |
| `tsci search "<q>"` | Search footprints/components/packages across sources | `tsci search "ESP32"` |
| `tsci search --jlcpcb "<q>"` | Search JLCPCB/LCSC by name or part number (`--lcsc` alias) | `tsci search --jlcpcb "ATmega328"` -> `ATMEGA328P-AU (C14877)` |
| `tsci search --kicad "<q>"` | Search KiCad footprint library | `tsci search --kicad "QFP-32"` -> `kicad:Package_QFP/LQFP-32_5x5mm_P0.5mm` |
| `tsci search --tscircuit "<q>"` | Search the tscircuit registry for packages/projects | `tsci search --tscircuit "LED"` |
| `tsci search ... --json` | Machine-readable JSON output (for scripts/agents) | `tsci search --jlcpcb "C14877" --json` |
| `tsci add <author/pkg>` | Add a registry package (installs `@tsci/*`) | `tsci add seveibar/PICO_W` -> `import { PICO_W } from "@tsci/seveibar.PICO_W"` |
| `tsci import "<query>"` | Interactive picker to import a specific part (registry or JLCPCB) | `tsci import "C14877"` |
| `tsci check netlist [file]` | Connectivity check - run this FIRST | `tsci check netlist` |
| `tsci check schematic-placement [file]` | Validate schematic-side placement | |
| `tsci check placement [file] [refdes]` | Validate PCB placement (whole board or one refdes) | `tsci check placement index.circuit.tsx U1` |
| `tsci check routing-difficulty [file]` | Flag congestion before routing | |
| `tsci check trace-length [file]` | Flag long straight distances (pre-route) / long routes (post-route) | |
| `tsci build [file]` | Compile to `circuit.json` (auto-detects entrypoint); outputs to `dist/` | `tsci build path/to/file.circuit.tsx` |
| `tsci build --all-images` | Also emit PCB/schematic/3D renders into `dist/` | |
| `tsci snapshot` | Generate + overwrite visual snapshots (schematic/PCB) | `tsci snapshot --pcb-only` |
| `tsci snapshot --test` | Regression mode: fail on visual diff, do NOT overwrite | |
| `tsci snapshot --3d` | Include 3D snapshots | |
| `tsci export <file> -f <fmt>` | Export a single artifact (see formats below) | `tsci export index.circuit.tsx -f pcb-svg` |
| `tsci login` | Browser-based auth | |
| `tsci push` | Publish package to registry (only when explicitly asked) | |
| `tsci auth print-token` | Print the current auth token | |
| `tsci --help` / `tsci <cmd> --help` | Authoritative flag reference - prefer over guessing | |

**Export formats (`-f`):** `schematic-svg`, `pcb-svg`, `readable-netlist`, `specctra-dsn`, `gltf`, `glb`, `kicad-library`.

**Recommended iteration order:** `tsci check netlist` -> `tsci check schematic-placement` -> `tsci snapshot` (inspect) -> `tsci check placement` -> `tsci check routing-difficulty` -> `tsci build`.

### Core JSX/TSX patterns

```tsx
import React from "react"

export default () => (
  <board width="20mm" height="20mm" layers={2}>
    {/* passives: footprint string sets the package */}
    <resistor name="R1" resistance="10k" footprint="0402" />
    <capacitor name="C1" capacitance="100nF" footprint="0402"
      supplierPartNumbers={{ jlcpcb: "C14663" }} />

    {/* chip with pin labels (multi-alias) + pin attributes for DRC/arrows */}
    <chip
      name="U1"
      footprint="qfp32"
      pinLabels={{
        pin1: ["GP0", "SPI0_RX", "I2C0_SDA"],
        pin8: "VCC",
        pin16: "GND",
      }}
      pinAttributes={{
        VCC: { requiresPower: true },
        GND: { mustBeConnected: true },
      }}
    />

    {/* USB-C: use <connector>, NOT a JLC import */}
    <connector name="USBC" standard="usb_c" />

    {/* connectivity */}
    <trace from="R1.pin1" to="C1.pin1" />
    <trace from="U1.VCC" to="net.V3_3" />   {/* named nets for power/gnd */}
    <trace from="U1.GND" to="net.GND" />
    <trace from="USBC.VBUS1" to="net.VBUS" />
  </board>
)
```

Key prop/pattern notes:
- **Footprint prop:** `footprint="0402"`, `"soic8"`, `"qfp32"`, `"dip8"`, or a KiCad path from `tsci search --kicad`.
- **Selectors:** port refs are `RefDes.pin` - `"U1.pin1"`, `"R1.pin2"`, or by label `"U1.GP0"`. CSS-style descendant selectors like `.U1 > .pin1` are also valid.
- **Nets:** `net.GND`, `net.VCC`, `net.V3_3` - preferred for power/ground rails over point-to-point traces.
- **Trace props (optional):** `width`/`thickness`, `minLength`/`maxLength`.
- **Layout props:** PCB `pcbX` `pcbY` `pcbRotation` `layer="bottom"`; schematic `schX` `schY` `schRotation` `schOrientation`.
- **Schematic readability (5+ parts):** group with `<schematicsection>` + `schSectionName`, and arrange chip pins with `schPinArrangement` (`leftSide`/`rightSide`/`topSide`/`bottomSide`).
- **Grouping:** `<group pcbX={5} pcbY={5}>...</group>` moves child parts together.
- **Manufacturing helpers:** `supplierPartNumbers={{ jlcpcb: "C14663" }}` to pin a SKU; `doNotPlace` to exclude a hand-soldered part from automated assembly.
- **Type-safe chips:** declare `pinLabels` as `... as const` and type the component `ChipProps<typeof pinLabels>`.

### Producing fabrication outputs
- **Single artifacts:** `tsci export <file> -f pcb-svg|schematic-svg|readable-netlist|specctra-dsn|glb|kicad-library`.
- **Fabrication zip (Gerbers + BOM CSV + Pick'n'Place CSV):** run `tsci dev`, then use the **export UI** in the browser. (Per the skill, the turnkey fab zip is produced from the dev export UI, not a one-shot CLI flag.)
- **Snapshot/DRC tests:** `tsci snapshot --test` in CI fails on visual diffs (regression gate). DRC violations during dev can be deferred; resolve before fab.

---

## 2. KiCad 8 / 9

Two editors: **Schematic Editor (Eeschema)** and **PCB Editor (Pcbnew)**. View the live, version-correct hotkey list any time with **Ctrl+F1**; customize under **Preferences -> Hotkeys**.

### Schematic Editor (Eeschema) hotkeys

| Action | Key |
|---|---|
| Place **W**ire | `W` |
| **A**dd symbol | `A` |
| Add **P**ower symbol | `P` |
| Place net **L**abel | `L` |
| Place global label | `Ctrl+L` (verify in-app) |
| Place **N**o-connect flag | `Q` (verify in-app; toolbar otherwise) |
| **M**ove | `M` |
| Dra**g** (keep connections) | `G` |
| **R**otate | `R` |
| **E**dit properties | `E` |
| Mirror X / Mirror Y | `X` / `Y` |
| Cycle wire posture | `/` |
| Copy / Paste / Undo / Redo | `Ctrl+C` / `Ctrl+V` / `Ctrl+Z` / `Ctrl+Y` |
| Escape current tool | `Esc` |

Annotate, ERC, and BOM are run from the **top toolbar / Tools menu** (no default key). `P`/`L` assignments vary slightly by KiCad version and theme - confirm with Ctrl+F1.

### PCB Editor (Pcbnew) hotkeys

| Action | Key |
|---|---|
| **Route** single track | `X` |
| Add **V**ia (while routing) | `V` |
| Next / previous layer | `+` / `-` (also `N` / `Shift+N`) |
| Fill all zones | `B` |
| Unfill all zones | `Ctrl+B` |
| **F**lip footprint to other side | `F` |
| **M**ove / **R**otate (CCW) / Rotate CW | `M` / `R` / `Shift+R` |
| **D**rag (push-and-shove) | `D` |
| **E**dit properties | `E` |
| Measure tool | `Ctrl+Shift+M` |
| Highlight net | backtick `` ` `` (verify in-app) |

Push-and-shove routing is the default router mode; `D`-dragging tracks shoves neighbors. DRC and differential-pair routing are launched from the toolbar/menu (no default key).

### DRC / ERC workflow
1. Schematic: **Inspect -> Electrical Rules Checker (ERC)**. Fix violations, re-run until clean.
2. Update PCB from schematic: **Tools -> Update PCB from Schematic** (`F8`).
3. PCB: **Inspect -> Design Rules Checker (DRC)**. Enable **Test for parity between PCB and schematic** to catch netlist drift.
4. Set constraints under **File -> Board Setup -> Design Rules / Constraints** (match your fab's trace/space/via rules).

### `kicad-cli` (headless, scriptable)
Lives at `kicad-cli` (bundled with KiCad 8/9). Docs: https://docs.kicad.org/9.0/en/cli/cli.html

**Schematic:**
```bash
kicad-cli sch export svg     -o out/  board.kicad_sch
kicad-cli sch export pdf     -o sch.pdf board.kicad_sch
kicad-cli sch export bom     -o bom.csv --exclude-dnp board.kicad_sch
kicad-cli sch export netlist -o net.net -f spice board.kicad_sch
kicad-cli sch erc            -o erc.rpt --format report --exit-code-violations board.kicad_sch
```
Netlist `-f` formats: `kicadsexpr`, `kicadxml`, `cadstar`, `orcadpcb2`, `spice`, `pads`, `allegro`.

**PCB - fabrication:**
```bash
# Gerbers (one layer per file). -l selects layers, e.g. F.Cu,B.Cu,F.Mask,...
kicad-cli pcb export gerbers -o gerbers/ board.kicad_pcb
# Drill files (Excellon). --generate-map adds a drill map
kicad-cli pcb export drill   -o gerbers/ --format excellon -u mm --generate-map board.kicad_pcb
# Pick-and-place (position) CSV, SMD only, exclude DNP
kicad-cli pcb export pos     -o cpl.csv --format csv --side both --smd-only --exclude-dnp board.kicad_pcb
# 3D STEP model
kicad-cli pcb export step    -o board.step board.kicad_pcb
# DRC with schematic parity, non-zero exit on violations
kicad-cli pcb drc            -o drc.rpt --format report --schematic-parity --exit-code-violations board.kicad_pcb
```
Gerber flags: `--erd` (exclude refdes), `--ev` (exclude values), `--no-x2` (legacy X1).

### Plotting Gerbers + drill for fab (GUI)
**File -> Plot** (select layers, set output dir, Gerber format, X2 attributes optional) -> **Generate Drill Files** (Excellon, PTH+NPTH, map optional). Then verify the set in GerbView before zipping (see section 5/6).

Docs: Eeschema https://docs.kicad.org/9.0/en/eeschema/eeschema.html · Pcbnew https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html

---

## 3. EasyEDA (Std + Pro) - ALTERNATIVE

Browser/desktop ECAD with native **JLCPCB** + **LCSC** integration. Two editions: **Std** (older, simpler, free) and **Pro** (current flagship; default theme uses `Alt+`-prefixed tool keys).

### Key shortcuts
| Action | Std | Pro (default theme) |
|---|---|---|
| Wire tool | `W` | `Alt+W` |
| Place / fit / DRC | via menus | via menus |

> Pro's hotkeys are theme-configurable - confirm the active set under **Settings -> Shortcut**. Most actions are reached via the top menu rather than keys.

### Core workflows
- **Convert / Update schematic -> PCB:** top menu **Design -> Update/Convert Schematic to PCB**. First conversion lays out the netlist + footprints; later runs push schematic changes into the existing PCB.
  - Std: https://docs.easyeda.com/en/Schematic/Convert-to-PCB/ · Pro: https://prodocs.easyeda.com/en/schematic/design-update-convert-schematic-to-pcb/
- **Design rules:** **Design -> Design Rule** (set track width, clearance, via sizes).
- **DRC:** run before generating fab files. Std: **Design -> Design Rule Check**. (https://docs.easyeda.com/en/PCB/Design-Rule-Check/)
- **LCSC part placement:** open the **Library** panel, search **LCSC** by part number, place the symbol+footprint (parts carry their LCSC SKU, which flows into the BOM for JLCPCB assembly). Mark parts "JLCPCB SMT" / Basic vs Extended as needed.

### Generate fab outputs
- **Gerbers:** **Fabrication -> PCB Fabrication File (Gerber)** (Std: this also offers "Order at JLCPCB" directly).
- **BOM:** **Fabrication -> BOM** (or **File -> Export BOM...**).
- **Pick-and-place:** **Fabrication -> Pick and Place File...**

### JLCPCB one-click order flow
From the PCB editor, **Fabrication -> PCB Fabrication File (Gerber)** opens a dialog with an **Order at JLCPCB** button that pushes the Gerbers (and, if assembling, the BOM + CPL) straight into a JLCPCB cart with stackup/quantity pre-filled. Review DFM in JLCPCB's viewer before paying.

### Std vs Pro - what differs
- **Pro** is the actively developed editor: better autorouter/interactive routing, multi-board/panel, hierarchical sheets, scripting, more robust DRC, configurable hotkeys. Recommended for new work.
- **Std** is lighter and great for quick boards; menus differ (e.g., `Fabrication`/`File -> Export`), default single-key shortcuts, fewer advanced features. Many older tutorials target Std.
- Pro quick start: https://prodocs.easyeda.com/en/quick-start.html

---

## 4. Flux.ai - ALTERNATIVE

Browser-based, AI-native ECAD. This is the quick layer. Docs: https://docs.flux.ai/Introduction/pcb-editor-shortcuts

### Essential shortcuts (PCB editor)
| Action | Key |
|---|---|
| Start/extend a trace | Click the white dot on a pad / trace end |
| Create trace elbow | Click |
| End trace | Click a pad/trace, or `Esc` |
| Flip trace elbow direction | `F` |
| Draw trace on next layer (drop a via) | `V` |
| Rotate right / left | `]` / `[` |
| Rotate right / left individually | `Shift+]` / `Shift+[` |
| **Ask Flux / open Copilot chat** | `Alt+C` (`Option+C` on Mac) |
| Publish project as component | `Ctrl+P` (`Cmd+P` on Mac) |

> Flux uses click-to-route rather than a single "route" hotkey. `W`/`F`/`V` exist as routing aids; confirm current bindings in-app (Flux updates frequently).

### Copilot / AI quick actions
- **Copilot chat (`Alt+C`):** natural-language design help - "wire these together," generate sub-circuits, explain a net. Copilot can wire components with your approval.
- **Copilot Shortcuts:** right-click a component or the project to pick a canned prompt (AI design review, identify PCB tech/budget/timeline, FMEA-style failure-mode review, schematic generation).
- Refs: https://www.flux.ai/p/blog/ai-shortcuts-for-pcb-design · https://docs.flux.ai/reference/copilot

---

## 5. Gerber viewers (inspect before you order)

| Tool | Type | URL |
|---|---|---|
| KiCad **GerbView** | Desktop, bundled with KiCad | (Start menu / `gerbview` - opens plotted Gerbers + drill) |
| **gerbv** | Free desktop viewer (RS-274X, Excellon drill, CSV pick-place) | https://gerbv.github.io/ |
| **tracespace.io** | Free online viewer; renders locally (files never leave the browser), per-layer + composite | https://tracespace.io/view/ |
| **Ucamco Reference Gerber Viewer** | Online, by the format's author; multilayer, measure/inspect | https://gerber-viewer.ucamco.com/ |
| **JLCPCB Online Gerber Viewer** | Online; flags common DFM issues for JLC fab | https://jlcpcb.com/RGE |
| **PCBWay Online Gerber Viewer** | Online viewer | https://www.pcbway.com/project/OnlineGerberViewer.html |
| **ZofzPCB** | Free 3D Gerber viewer (see inner layers in 3D) | https://www.zofzpcb.com/ |

---

## 6. Cross-tool fabrication checklist

Universal "export and verify before you order" steps, regardless of which tool produced the design:

**Before export**
- [ ] ERC clean (schematic): no floating power pins, no unintended no-connects.
- [ ] DRC clean (PCB): trace width / clearance / via sizes meet your **fab's** rules (set these from the fab's capability sheet, not defaults).
- [ ] Schematic-parity / netlist check passes (PCB matches schematic).
- [ ] Board outline, mounting holes, and keepouts correct; pin-1 orientation right on polarized parts.
- [ ] Net labels and power/ground rails clearly named.

**Export the fab package**
- [ ] **Gerbers** - one file per copper/mask/silk/paste layer + board outline (Edge.Cuts).
- [ ] **Drill files** - Excellon, PTH + NPTH (plus drill map if your fab wants it).
- [ ] **BOM (CSV)** - with supplier part numbers (LCSC/JLCPCB SKUs for turnkey assembly); DNP parts marked/excluded as intended.
- [ ] **Pick-and-place / CPL (CSV)** - SMD parts, correct side + rotation; DNP excluded.
- [ ] 3D **STEP** (optional) for mechanical/enclosure fit.

**Verify before ordering**
- [ ] Open the zipped Gerbers in an **independent** viewer (section 5) - never trust only the tool that made them.
- [ ] Confirm layer count/stackup, copper polarity (no inverted ground plane), silkscreen legibility, and that the drill file aligns to pads.
- [ ] Run the fab's own online DFM/Gerber viewer (JLCPCB/PCBWay) and resolve flagged DFM issues.
- [ ] Confirm board dimensions match the intended outline; check the smallest trace/space and smallest drill against the fab's minimums.
- [ ] Match quantity, thickness, copper weight, surface finish, and color to the order before paying.
