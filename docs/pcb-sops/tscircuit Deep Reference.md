# tscircuit Deep Reference

Deep reference for tscircuit. tscircuit is an open-source (MIT) React/TypeScript framework: you write a circuit as JSX/TSX and it renders the schematic, PCB layout, 3D model, SPICE simulation, and fabrication files from the same source. This is the "understand tscircuit properly" doc; for the one-screen cheat-sheet see the **ECAD Tools & Commands Quick-Reference**.

Last reviewed: 2026-06-20. Researched from tscircuit.com, docs.tscircuit.com, and the official tscircuit skill (https://github.com/tscircuit/skill). The docs are unpinned ("current"); the `tsci check` subcommands and some import paths are marked "under development", so confirm exact flags with `tsci <cmd> --help` before relying on them.

---

## 1. The model

- **Electronics as code.** A circuit is a `*.circuit.tsx` (or `index.tsx`) file that default-exports a React component returning JSX. The root is `<board width height layers>` (or a form-factor component from `@tscircuit/common` like `ArduinoShield`, `RaspberryPiHat`). Components compose like UI components, but for resistors, chips, and traces.
- **Schematic and PCB are one description, not two processes.** Unlike KiCad/Altium where the schematic and layout are separate artifacts you keep in sync, tscircuit renders both from the same source every time. You nudge each view with layout props plus automation.
- **Circuit JSON is the central intermediate format** - "assembly language for electronic circuits." Every design compiles to Circuit JSON (a typed array of elements covering PCB traces, schematic connectivity, 3D, BOM, sim). Every export (Gerbers, SVG, BOM, PnP, SPICE, STEP, KiCad) is a downstream conversion of Circuit JSON. Types live in the `circuit-json` npm package.
- **Eval pipeline:** TSX is executed by `@tscircuit/core` (`RootCircuit`) or `@tscircuit/eval` (`CircuitRunner`, adds registry auto-import + transpilation) -> `renderUntilSettled()` -> `getCircuitJson()`. Runs in Node, Bun, or fully in-browser (WebWorker). **runframe** (`@tscircuit/runframe`) is the React viewer that executes code in-browser and shows PCB/schematic/3D.
- **Why it is worth using:** git-versioned, PR-diffable, and AI-agent-iterable. It is a code-to-PCB *implementation* layer downstream of whatever architecture/validation planning you do.

---

## 2. CLI (`tsci`) - complete

**Runtime:** Node.js or Bun. Note: on some Windows installs the `tsci` shim is hardcoded to bun.exe with no node fallback, so keep Bun installed if you hit that. Install the CLI: `npm install -g tscircuit` or `bun install --global tscircuit`; per-project `npm add -D tscircuit`.

| Command | Purpose / key flags | Example |
|---|---|---|
| `tsci init [dir]` | Scaffold project (index.tsx, package.json, tsconfig, tscircuit.config.json). `-y`, `--no-install` | `tsci init -y` |
| `tsci dev [file]` | Live preview server at http://localhost:3020 (`-p` to override). UI: PCB/Schematic/3D tabs, File -> Export (fab files, KiCad library), File -> Import (JLCPCB). `--kicad-pcm` serves a KiCad PCM repo at :3023 | `tsci dev -p 3021` |
| `tsci build [file]` | Compile to `circuit.json` in `dist/`. Flags: `--all-images`, `--pcb-png`, `--3d`/`--3d-png`, `--glbs`, `--svgs`, `--ci`, `--routing-disabled`, `--disable-parts-engine`, `--ignore-*-drc`, `--kicad-project[-zip]`, `--kicad-library`, `--transpile` | `tsci build index.circuit.tsx --all-images` |
| `tsci export <file>` | Convert TSX/Circuit JSON via `-f`, `-o`. Formats below | `tsci export board.tsx -f gerbers -o fab.zip` |
| `tsci snapshot [path]` | Regression SVG snapshots in `__snapshots__/`. `--test` (fail on diff), `-u`, `--pcb-only`, `--schematic-only`, `--3d` | `tsci snapshot --test` |
| `tsci check <sub>` | Partial-build validation (under development). Subs: `netlist [refdes]`, `schematic-placement`, `placement [file] [refdes]`, `routing`/`routing-difficulty`, `trace-length` | `tsci check netlist` |
| `tsci simulate analog <file>` | Run analog SPICE sim, print results table. `--disable-parts-engine` | `tsci simulate analog my.circuit.tsx` |
| `tsci search <q>` | Search parts. `--jlcpcb`/`--lcsc`, `--kicad`, `--tscircuit`, `--json` | `tsci search --jlcpcb "ATmega328"` |
| `tsci add <author/pkg>` | Install registry package -> `@tsci/author.pkg` | `tsci add seveibar/PICO_W` |
| `tsci remove <pkg>` | Inverse of add | |
| `tsci import <query>` | Interactive picker; import a part from JLCPCB or registry. `--jlcpcb`, `--tscircuit`, `--download` (fetch .obj/.step 3D) | `tsci import "C14877"` |
| `tsci clone [pkg]` | Download a registry package locally. `-a` (include author dir) | `tsci clone seveibar/PICO_W -a` |
| `tsci convert <file>` | `.kicad_mod` footprint -> TSX component. `-o`, `-n` | `tsci convert X.kicad_mod -n CustomPad` |
| `tsci install [pkg]` | Install deps (npm / GitHub URL / KiCad lib) | `tsci install https://github.com/espressif/kicad-libraries` |
| `tsci transpile [file]` | TSX -> dist JS/CJS/d.ts (no circuit.json) | |
| `tsci push [--compress]` | Publish to registry (needs login; default private) | |
| `tsci login` / `tsci logout` | GitHub OAuth (needed for cloud autorouting + publishing) | |
| `tsci auth <sub>` | `whoami`, `print-token`, `set-token`, `setup-npmrc` | `tsci auth print-token` |
| `tsci config <sub>` | `print`, `set <k> <v>` (writes tscircuit.config.json) | `tsci config set mainEntrypoint index.tsx` |
| `tsci doctor` | Diagnose env/deps/auth | |
| `tsci <cmd> --help` | Authoritative flag reference - prefer over guessing | |

**Export formats (`-f`):** `circuit-json`/`json`, `schematic-svg`, `pcb-svg`, `assembly-svg`, `gerbers` (zip), `readable-netlist`, `specctra-dsn`, `gltf`, `glb`, `step`, `kicad_sch`, `kicad_pcb`, `kicad_zip` (full project), `kicad-library`, `spice`.

**AI / headless iteration loop (from the skill):** prefer `tsci build` and `tsci check` over `tsci dev` (dev is for human visual feedback). Order: `check netlist` -> `check schematic-placement` -> `snapshot` (inspect) -> `check placement` -> `check routing-difficulty` -> `build`. DRC errors can be deferred until fab prep.

---

## 3. Authoring syntax

**Units:** bare numbers = mm; strings carry units (`"0.1in"`, `"2.54mm"`, `"1k"`, `"100nF"`).

### Elements (builtin)
`<board>`, `<group>`, `<subcircuit>`, `<chip>` (the workhorse - models almost any single part), passives `<resistor>` `<capacitor>` `<inductor>` `<diode>` `<led>` `<fuse>` `<crystal>` `<resonator>` `<potentiometer>`, semiconductors `<mosfet>` `<transistor>` `<opamp>`, `<connector>`, `<jumper>`/`<solderjumper>`, `<pinheader>`, `<switch>`/`<pushbutton>`, `<net>`/`<netlabel>`/`<netalias>`, `<trace>`/`<pcbtrace>`/`<tracehint>`, `<via>`, `<hole>`/`<platedhole>`, `<smtpad>`, `<testpoint>`, `<fiducial>`, `<cutout>`, `<copperpour connectsTo="net.GND" clearance="0.2mm">`, `<symbol>`/`<port>` (custom schematic symbols), `<footprint>`, silkscreen/courtyard/fab-note primitives, `<panel>`/`<subpanel>` (panelization), `<breakout>`/`<breakoutpoint>`, `<constraint>`, `<cadmodel>`/`<cadassembly>`, and the simulation elements (section 7).

### Reference example
```tsx
import { sel } from "tscircuit"

export default () => (
  <board width="22mm" height="22mm" layers={4}>
    <schematicsection schSectionName="Power">
      <capacitor name="C1" capacitance="100nF" footprint="0402"
        supplierPartNumbers={{ jlcpcb: "C14663" }} />
    </schematicsection>

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

    <connector name="USBC" standard="usb_c" />

    <trace from={sel.U1.VCC} to="net.V3_3" />
    <trace from={sel.U1.GND} to="net.GND" />
    <trace from="USBC.VBUS1" to="net.VBUS" />
    <copperpour connectsTo="net.GND" clearance="0.25mm" />
  </board>
)
```

### Key patterns
- **Layout props (two coordinate systems):** PCB `pcbX` `pcbY` `pcbRotation` `layer` (`"top"`/`"bottom"`); schematic `schX` `schY` `schRotation` `schOrientation`. Both can coexist on one element.
- **Pins:** `pinLabels` accepts multi-alias arrays; any alias is usable in a trace; labels may start with a digit (`"3V3"`). `pinAttributes` (`requiresPower`, `providesPower`, `mustBeConnected`, `includeInBoardPinout`) drives DRC and schematic arrows. `schPinArrangement` controls which side each pin sits on the symbol.
- **Wiring:** `<trace from="R1.pin1" to="C1.pin1" />`; nets via `<trace from="U1.pin8" to="net.VCC" />`. Trace props `width`/`thickness`, `minLength`/`maxLength`. A part's `connections={{ GND1: "net.GND" }}` prop is shorthand for traces.
- **Selectors:** CSS-like `.R1`, `.R1 > .pin1`, `net.GND`. Do not cross subcircuit boundaries unless you traverse explicitly.
- **`sel.*` helper** (`import { sel } from "tscircuit"`): type-checked selectors - `sel.R1.pin1`, `sel.U1(MyChip).VCC`, nested `sel.M1(MyModule).U1.GND`. Prefer it over string selectors for type safety.
- **Connectors:** prefer `<connector standard="usb_c" />` for USB (gives USB-specific DRC) over a JLC import.
- **Grouping & subcircuits:** `<group pcbX pcbY>` moves children together; `<subcircuit>` is a tightly-coupled reusable block with selector isolation. `<schematicsection schSectionName="...">` draws labeled regions ("Power"/"MCU"/"IO") - the single biggest schematic-readability lever on 5+ part boards.
- **Manufacturing:** `supplierPartNumbers={{ jlcpcb: "C14663" }}` pins a SKU; `doNotPlace` excludes from auto-placement/PnP.
- **Registry imports:** `import { PICO_W } from "@tsci/seveibar.PICO_W"`.

---

## 4. Footprints and parts

- **Footprinter strings** (`footprint="..."`): concise, map to builtin 3D models, recommended. Examples: `0402`, `0603`, `soic8`, `qfp32`, `dip16_p1.27_id0.6mm_od0.9mm`, `pushbutton_id1.3mm_od2mm`. Modifier params encode pitch (`_p0.5mm`), inner/outer dia (`_id`/`_od`).
- **KiCad footprints inline:** `footprint="kicad:Resistor_SMD/R_0402_1005Metric"` (fetched on demand from KiCad GitLab libs). Convert `.kicad_mod` -> TSX with `tsci convert`. Import a whole `.kicad_pcb` as Circuit JSON via `<subcircuit circuitJson={...} />`.
- **JLCPCB/LCSC inline:** `footprint="jlcpcb:C2040"` (pulls footprint + 3D from EasyEDA). Discover via `tsci search --jlcpcb`, import via `tsci import` or the dev UI File -> Import.
- **Custom footprints:** `<footprint>` with child `<smtpad>`/`<platedhole>`/`<silkscreenpath>`.
- **BOM flow:** parts can be specified without part numbers - the BOM auto-generates against real-time supplier stock (the parts engine). Pin a specific SKU with `supplierPartNumbers`; exclude with `doNotPlace`. `jlcsearch.tscircuit.com` backs part search.

---

## 5. Autorouting

- **Built-in, real-time, local** (sub-second on 4-layer boards).
- **Modes** via `<board autorouter={{...}} />`: local `algorithmFn` callback; cloud `autorouter="auto-cloud"` (`serverMode: "job"` async jobs needing login, or `"solve-endpoint"` sync). `inputFormat: "simplified" | "circuit_json"`.
- **SimpleRouteJson** is the router I/O: `layerCount`, `minTraceWidth`, `obstacles`, `connections`, `bounds`; the router appends `traces`.
- **External:** export `specctra-dsn` (`tsci export -f specctra-dsn`) to route in Freerouting.
- **Manual:** `<pcbtrace>`/`<tracehint>`, `<via>`, `<breakout>`/`<breakoutpoint>`. Drag-edits in the viewer persist to `manual-edits.json` and re-import via the `manualEdits` prop. PCB auto-layout engines: `pcbGrid`, `pcbFlex`, `pcbPack`.

---

## 6. Fabrication outputs

- **Fab zip** contains `gerbers/` (copper + drill + cutouts), `bill-of-materials.csv`, `pick-n-place.csv`; pin-1 marked with a triangle on the assembly view.
- **Produce it:** dev/web UI -> File -> Export -> "Fabrication Files"; CLI -> `tsci export <file> -f gerbers` yields the Gerber/drill zip. The BOM/PnP CSVs come from the dev/web export UI (and the `circuit-json-to-bom-csv` / `circuit-json-to-pnp-csv` packages). All exports derive from Circuit JSON.
- **3D:** `gltf`/`glb`/`step`. **SVG:** `schematic-svg`/`pcb-svg`/`assembly-svg`. **KiCad:** `kicad_zip` (full project), `kicad-library` (symbols + footprints + 3D + lib tables).
- **Ordering:** the tscircuit platform has an Order button (JLCPCB quote + Stripe), or upload the fab zip to JLCPCB/PCBWay yourself. Always inspect Gerbers in an independent viewer first (see the Manufacturing SOP).

---

## 7. Simulation - native SPICE / ngspice

tscircuit has first-class analog SPICE simulation, run via `tsci simulate analog <file>` (CLI) or in-browser, backed by WebAssembly ngspice. Engine selectable: `spiceEngine="spicey"` (default WASM engine) or `"ngspice"`.

- Enable on a board: `<analogsimulation duration="10ms" timePerStep="0.1ms" spiceEngine="ngspice" />` (often with `routingDisabled`).
- Sources: `<voltagesource name voltage waveShape("dc"|"sine"|"square"|"triangle") frequency amplitude offset dutyCycle />`, `<currentsource>`.
- Probes: `<voltageprobe name connectsTo=".R1 > .pin1" referenceTo />` records a node voltage.
- Vendor models: `<spicemodel source="<.subckt text>" spicePinMapping />` attaches a SPICE macromodel.
- Export a raw SPICE netlist: `tsci export -f spice` (underlying converter: `circuit-json-to-spice`).
- This complements a standalone ngspice install: you can simulate straight from the board source, or export SPICE/Circuit JSON and run it through an external ngspice pipeline.

---

## 8. Testing and eval

- **Snapshot testing:** `tsci snapshot` writes SVG snapshots; `tsci snapshot --test` is CI regression mode (fail on visual diff). Stored in `__snapshots__/*.snap.svg`.
- **Checks:** `tsci check netlist | schematic-placement | placement | routing | routing-difficulty | trace-length` (incremental, flagged under development). DRC via `<drccheck>`/`<keepout>`; DRC errors deferrable in dev.
- **Eval harness:** `@tscircuit/eval` (`CircuitRunner`, `createCircuitWebWorker()`) is the programmatic engine for AI/headless runs. `@tscircuit/core` (`RootCircuit`) is the lower-level executor.

---

## 9. Registry and ecosystem

- **Platform:** tscircuit.com (online editor + playground, public board gallery, GitHub PR visual diff). **npm registry:** npm.tscircuit.com (`.npmrc`: `@tsci:registry=https://npm.tscircuit.com`). **API:** api.tscircuit.com (Bearer token from `tsci auth print-token`).
- **Package naming:** `@tsci/<author>.<package>`; publish with `tsci push` (default private).
- **Web APIs:** compile.tscircuit.com (code -> circuit_json), svg/png.tscircuit.com (render previews), jlcsearch.tscircuit.com (part search), Datasheet API, Ordering API.
- **Key npm packages:** `tscircuit` (CLI+meta), `@tscircuit/core`, `@tscircuit/eval`, `circuit-json`, `@tscircuit/runframe`, `@tscircuit/common` (form factors), the `circuit-json-to-*` converter family, `kicad-component-converter`.

---

## 10. Integration with other tools

- **KiCad (bidirectional):** import `.kicad_mod`/`.kicad_sym`/`.kicad_pcb` (inline `kicad:` strings, `tsci convert`, or Circuit JSON); export full KiCad project (`kicad_zip`) or a `kicad-library`; native KiCad PCM support (`tsci dev --kicad-pcm`). Pairs directly with a kicad-cli fab-output step.
- **Fabs:** Gerber/BOM/PnP zip -> JLCPCB/PCBWay (or in-platform ordering).
- **SPICE/ngspice:** native (section 7), plus raw SPICE/Circuit JSON export to feed an external ngspice pipeline.
- **AI/agents:** the official tscircuit skill (https://github.com/tscircuit/skill) is the agent integration - CLI/SYNTAX/WORKFLOW/CHECKLIST primers + per-element docs. No dedicated tscircuit MCP server exists; AI integration is skill-based plus the headless `@tscircuit/eval`/compile-API path.

---

## Sources
- tscircuit.com and docs.tscircuit.com (unpinned "current" docs).
- Official tscircuit skill: https://github.com/tscircuit/skill (CLI.md, SYNTAX.md, WORKFLOW.md, CHECKLIST.md, per-element docs).
- GitHub org github.com/tscircuit (circuit-json, runframe, eval, core, converters).
