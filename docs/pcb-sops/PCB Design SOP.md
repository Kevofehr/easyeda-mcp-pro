# PCB Design SOP (Schematic + Layout)

Standard operating procedure for designing printed circuit boards: schematic capture, layout, and the conventions that keep boards manufacturable, debuggable, and professional. This is the "how to design a good board" reference. For getting boards built see the **PCB Manufacturing & Assembly SOP**; for vendors see the **PCB Vendor Reference List**; for tool commands see the **ECAD Tools & Commands Quick-Reference**.

Last reviewed: 2026-06-20. Sources are listed at the end (NASA/Sierra High-Speed Design Guide, TI/Analog Devices/ST/Microchip application notes, Altium documentation, Flux.ai documentation, JLCPCB, and the r/PrintedCircuitBoard community review wikis). Numbers are starting points; always confirm against the part datasheet and the chosen fab's capability sheet.

---

## 0. The design workflow (do these in order)

Good hardware work follows research -> plan/validate -> build; do NOT jump to layout while the design is only stubbed:

1. **Research** the parts and the problem. Pull the latest datasheet, app notes, errata, and reference designs for every active part. Verify pinouts and package variants.
2. **Plan and validate the architecture** (interfaces, connections, part compatibility, open questions) before touching ECAD. "Let's build X" is scope direction, not a signal to skip planning.
3. **Schematic capture** (sections 1-6 below).
4. **Layout** (sections 7-9).
5. **Self-review** against the checklist (section 11), run DRC/ERC (section 10), and inspect Gerbers in an independent viewer.
6. **Fab + assembly** (see the Manufacturing SOP).

---

## 1. Schematic capture: the rules that matter

A schematic exists to communicate the circuit clearly to a human, not just to net-connect parts. The single most-repeated professional complaint is schematics that are technically connected but unreadable.

### Readability (non-negotiable)
- **Signal flow left-to-right, power top-to-bottom.** Inputs on the left, outputs on the right; positive rails point up, ground points down. (Negative rails point down, their ground up. Bipolar analog: + up, - down.)
- **Connect with wires, not a "sea of net names."** Use actual lines for things that are easy to connect; reserve net labels for buses and cross-sheet signals. Both extremes (too many labels, or zero structure) hurt. This is the #1 reviewer complaint.
- **Do not route lines through component symbols.** Draw around them. Never let text, lines, or symbols touch each other.
- **No 4-way junctions** (ambiguous dot/cross connections). Stagger to T-junctions.
- **Group IC pins by function, not by package pin order.** Power top, grounds bottom, inputs left, outputs right. (Exception: very high-pin-count parts, >100 pins, where you should still show pin numbers; and trivial 3-pin parts where package order is fine.)
- **Use standardized symbols, not generic boxes.** Correct symbol shapes for diodes, transistors, capacitors, switches, logic gates, op-amps. Use historical functional layouts for 555 timers, 3-pin regulators (In-left / Out-right / Gnd-or-Adj-bottom), op-amps, and logic gates, not pinout-order rectangles.
- **Pick one symbol standard (IEC or IEEE) and use it uniformly.** Do not mix resistor zigzag and rectangle on the same sheet.
- **Light background, normal orientation.** Never dark-background or rotated schematics (also the rule for review exports: lossless PNG/PDF, no grid, cropped).

### Multi-sheet structure
- **Flat design:** all sheets on one level, joined by ports/off-sheet connectors. Fast to draw, harder to trace. Fine for small boards.
- **Hierarchical design:** a parent sheet of sheet-symbols (blocks) whose sheet-entries connect down to ports on child sheets. Slower to draw, far more legible, essential for reuse and team-scale work. Preferred for anything non-trivial.
- **Put a high-level block diagram on the first page** of any complex design. Large companies do this on 50-100 sheet schematics for a reason.
- Do NOT over-fragment into many tiny label-linked "modular" pages. A voltage divider plus a cap is not a hierarchical block. Find the balance.
- Keep **sheet entries synchronized with child-sheet ports** (name + direction); mismatches silently break cross-sheet connectivity.

### Title block (every sheet)
Board name/description, author initials, release date, **revision** (pick a format such as v1 or "A" and stick to it), and sheet number (1 of N). Update date + revision on every release. Add net-class definitions and design notes/rationale on the schematic itself; mark do-not-substitute parts with the reason; paste relevant datasheet tables and calculated values (show Vout AND Vfb, not just the result).

---

## 2. Reference designators and naming standards

Governing standards: **IEEE 315-1975** (Clause 22 class-designation letters), superseded reference **IEEE 200 / ANSI Y32.16**, and the current **ASME Y14.44-2008 (R2014)** for designation construction. Industrial/installation wiring uses **IEC 81346** + **NFPA 79 Annex E** instead (note for non-PCB electrical).

### Rules
- **Start each RefDes type at 1 and renumber with no gaps** (C1, C2, C3; not C2, C5, C9). Exception: large multi-page designs may start each page on a decade/century (R101 on page 1, R301 on page 3).
- **Never reuse one letter for every part** and never use random letters.
- **P = plug (more-movable), J = jack (less-movable)** assigned by fixedness, not gender.
- Multi-unit ICs use sub-parts: U1A, U1B (always show a dedicated power symbol for the shared package, e.g. a quad op-amp = 4 amp symbols + 1 power symbol).

### Canonical RefDes letters (IEEE 315 + common modern use)

| Letter | Component |
|---|---|
| R | Resistor (RN = network, RT = thermistor, RV = varistor) |
| C | Capacitor |
| L | Inductor / coil / ferrite bead (FB also used for ferrite bead) |
| D | Diode, LED, thyristor (CR in older docs) |
| Q | Transistor (BJT/FET) |
| U | Integrated circuit (IC in older docs) |
| J | Jack (least-movable connector) |
| P | Plug (most-movable connector) |
| X | Socket (XU = IC socket, XF = fuse holder) |
| K | Relay / contactor |
| S / SW | Switch, button |
| F | Fuse |
| T | Transformer |
| Y | Crystal / resonator / oscillator |
| DS | Display / indicator / lamp |
| BT / B | Battery / holder |
| M | Motor |
| LS / SPK | Loudspeaker / buzzer |
| VR | Voltage regulator or potentiometer/trimmer (regulators often -> U) |
| TP | Test point |
| JP | Jumper |
| H / MP | Hardware / mechanical part |
| W | Wire / cable |
| FD | Fiducial |

Modern silkscreen practice collapses compound prefixes toward the short letter (BR/ZD/LED -> D, IC -> U) to save space; acceptable but a deviation from strict standard.

### Net naming
- Name nets meaningfully: `VCC_3V3`, `SPI0_SCLK`, `MOTOR_EN`, `ESP_TX`, `HOST_RX`. Avoid bare `TX`/`RX`/`GPIO1` and tool-generated names like `SIG$1`.
- **Differential pair net names must end in `_P` / `_N`.**
- Watch the classic swap errors: connect TX to RX (not TX to TX), and MISO/MOSI / SDO/SDI direction depends on master vs slave.

---

## 3. Component values and value format

- **Use orderable standard (E-series) values.** 5uF and 5K do not exist; use 4.7 / 5.6 (or 5.1K, 4.99K for tight tolerance). Pots/trimmers come in 1-2-5 per decade.
- **Add the value next to every symbol:** capacitance on caps, resistance on resistors/pots/trimmers, inductance on inductors, frequency on crystals/oscillators, voltage on zeners/TVS/batteries, color on LEDs, pole/throw on switches (SPST/DPDT), part number on ICs/transistors/regulators (shorten on the symbol, full MPN in the BOM).
- **Pick one value format per part type and use it uniformly.** Prefer letter-as-decimal-point (4p7, 4n7, 4u7, 4R7, 4K7) which survives low-res printing. Do not mix 0.1uF / 100nF / 0u1 on one sheet. Avoid "mF" and obsolete mfd/mmfd.
- Connectors: label the family next to the symbol (JST PH, Molex SL, USB-C, microSD) and include the pitch in mm for multi-pitch families.

---

## 4. Power, decoupling, and grounding (with numbers)

### Decoupling / bypass capacitors
- **One 0.1uF (100nF) ceramic per VDD/VCC pin**, placed as close as physically possible to the pin, surface-mount, low-ESR/ESL (0603 or smaller). Draw each bypass cap NEXT TO the part it serves on the schematic; never dump them all in one corner (high-pin-count ICs are the exception).
- **Use a multi-band cap array per rail:** bulk 4.7-47uF (low-frequency droop) + 0.1uF (mid) + 0.01uF or smaller (high). The frequency where ripple occurs matters more than the exact value. Parallel small caps beat one large cap at high frequency (lower series inductance).
- **Regulators:** bypass cap on BOTH input and output (correct value and type per datasheet).
- **Connector power pins:** 10-100nF next to each non-ground power pin; consider a ferrite bead and/or TVS for robustness. USB VBUS total decoupling 1-10uF (USB 2.0 inrush spec).
- **Cap voltage rating >= 1.5x the maximum expected voltage** (Flux AI-review default).
- Keep the bypass current loop tiny: trace length-to-width ratio <= 3:1 on the bypass loop; if loop inductance is too high, switching current is drawn from the supply leads instead of the cap and the board radiates.

### Power distribution and trace sizing (IPC-2221)
- Trace width is set by allowable temperature rise. The IPC-2221 basis: Area[mils^2] = (I / (k * dT^0.44))^(1/0.725); Width[mils] = Area / (Thickness[oz] * 1.378). External layers k = 0.048; internal layers k = 0.024.
- **Internal traces need ~2x the width of external traces** for the same current (they run hotter, no convection). In vacuum or potted assemblies, use internal-layer rules even for external traces.
- **1 oz copper, ~10 C rise rules of thumb:** ~10 mil ≈ 1 A; ~60 mil ≈ 3 A; ~110-120 mil ≈ 5 A; 250 mil ≈ 15 A at higher rise. Always confirm with a calculator (4pcb / Saturn PCB) for the exact stackup and copper weight.
- Default to **10 C rise**; use 20 C+ only when you deliberately want skinnier traces. Wagon-wheel/spoke connections to a plane can be narrower than the calculator says (short and heat-sunk).
- Use **wider traces for power and high-current**; use copper pours/floods for ground. Run power directly over ground to minimize loop area.

### Grounding
- **A solid ground plane is the single biggest design win:** lowest resistance and inductance return, EMI shield, and it enables controlled-impedance traces. Avoid bus-wire grounds (#22 AWG ≈ 20 nH/in; a 10 mA/ns edge drops 200 mV per inch).
- **Do NOT split ground planes** unless you specifically understand the need. Instead cluster components by supply rail and separate noisy/quiet sections, and prefer adding ground planes over splitting one. Route signals only across un-split "bridges."
- **Analog/digital:** separate AGND and DGND and the supplies, join at a single star point (conveniently at the power supply). Voltage between two ground planes must never exceed 300 mV (IC damage risk). Never overlap analog and digital planes (capacitive coupling).
- **Return current follows the path of lowest impedance directly under the signal trace.** Minimizing loop area matters more than minimizing trace length. Roughly 95% of return current flows within 3x the trace width of the signal.
- **2-layer fallback:** emulate a plane by "gridding" (orthogonal ground traces + ground fill, vias at every crossing, fill tied at >=2 points). Gets ~95% of a 4-layer board's benefit.

---

## 5. Protection: ESD, unused pins, MOSFET gates

### ESD / TVS
- **Put a TVS diode on every externally-facing connector signal** (USB, buttons, headers, exposed I/O). Place it AT the connector, closer to the pin than even the bypass cap or ferrite bead. No stub between the TVS and the protected line; route source-to-TVS with straight traces and corners <= 45 degrees (90-degree corners radiate far more).
- TVS ground pin ties to the ground plane and is stitched with a via immediately adjacent to the pin. For an 8 kV IEC 61000-4-2 event dI/dt ≈ 4e10 A/s, so even 0.25 nH adds ~10 V; minimize inductance to ground.
- A series resistor (100 ohm to 1k) plus the MCU's internal ESD diode greatly improves survival by steering ESD current away from the pin; add a small cap for slow signals.

### Unused pins (must always be handled, they can oscillate or draw high current)
- Always check the datasheet first. CMOS: tie to VCC/GND directly or via series resistor. TTL: tie to a rail. Microcontroller configurable pins: set in firmware and use a series resistor (in case firmware mis-sets it as an output) rather than tying directly to a rail. Transceivers (74x245): never tie data pins directly to a rail. Op-amps/comparators: terminate per the proper method (divider or voltage-follower) to prevent self-damage/oscillation.
- Open-collector / open-drain outputs (I2C, reset, some interrupts) need pull-ups. Always include I2C pull-up footprints even if you might not stuff them.

### MOSFET gates
- Add a gate pull-down or pull-up (10k-1M) so the gate cannot float at power-up, standby, or cable-unplug. Consider a series gate resistor for ringing control, and gate over-voltage protection (Zener/TVS) when drive voltage is high (e.g. 24 V); not needed for 5 V logic drive.

---

## 6. Datasheet and footprint verification (catches the expensive mistakes)

- **Verify schematic symbol pin numbers map to the correct physical footprint/package.** A one-character part-number difference can mean a different pinout. Beware multiple pinout variants: 3-pin transistors (E-C-B vs E-B-C vs C-B-E), 3-pin regulators (G-I-O vs I-O-G), connector orderings.
- Read each part's PCB-layout section in its datasheet (noise/inductance/capacitance-critical layouts) before you place it.
- Mind logic-level compatibility: do not mix 3.3 V and 5 V logic/modules without level handling. Failures are intermittent and board-dependent.

---

## 7. PCB layout best practices

### Order of operations
1. **Board outline** first (correct dimensions, fit fab fixed-price tiers, cutouts on the right layer).
2. **Mounting holes second** (hard to add after routing). Treat as critical hardware; list as zero-cost BOM lines. Correct hole diameter for the screw (M3 ≈ 3.2 mm clearance; measure real hardware with calipers and check McMaster-Carr). Reserve a keep-out courtyard on BOTH sides for the screw head/washer/standoff (M3 head ≈ 6 mm, keep-out ≈ 7-8 mm). Keep holes off the board edge per fab rules and aligned to case mounts/connector positions.
3. **Position-critical parts** (board-to-board connectors, anything aligning to a case opening, height-restricted zones).
4. Then general placement, then routing, then pours, then silkscreen, then DRC.

### Stackup (prefer 4-layer for anything non-trivial)
- **4-layer is preferred** even when 2 would fit: dedicated internal ground + power planes give every signal a continuous adjacent return, controlled impedance, lower EMI, and lower PDN impedance. The price delta is small. Many professional reviewers refuse to review 2-layer boards with power/ground snaking everywhere.
- Plan the stackup BEFORE routing. Stackups are symmetric ~99% of the time.
- **Recommended 4-layer (62 mil / 1.57 mm board, Rick Hartley):**
  - Higher density: Signal+GND / Signal+Power / core / Signal+Power / GND, i.e. GND - Sig/Pwr - Sig/Pwr - GND.
  - Lower density: Sig+Pwr / GND / core / GND / Sig+Pwr.
  - Keep each signal layer adjacent to a reference plane; place ground adjacent to any high-transient power plane.
- Prepreg rules: <= 3 different prepreg types, each dielectric < 10 mils; avoid resin-starved high-glass prepregs (7628, 2116).

### Trace widths and pours
- Power/high-current traces wider than signal traces (IPC-2221, section 4). Ground floods satisfy the ground return.
- Default trace width should not be left at the tool minimum. Set a sensible default (>= 0.2 mm / ~8 mil for general signals) and bump power up.
- Use copper pours for ground; check for floating/isolated copper islands and stitch or keep-out them away.

### Vias
- Each via adds impedance and cost; minimize count. Size vias to current. Use via stitching for ground-plane continuity and via stitching adjacent to any signal via that changes reference planes.
- Remove non-functional pads on unconnected layers. For high-speed, remove via stubs via back-drilling or blind/buried/microvias.
- DFM ceilings (NASA): through-hole aspect ratio <= 1:10; microvia <= 1:0.75; <= 3-5 lamination cycles; drill-to-plane clearance 8 mils.

### Routing hygiene
- Adjacent layers route orthogonally (one horizontal, one vertical) to cut crosstalk, especially on 2-layer boards.
- Do not route high-current or high-speed traces under crystals, antennas, or other sensitive circuits, and never route signals under an antenna.
- Prefer 45-degree or rounded corners over 90-degree.

---

## 8. High-speed and EMI

- **Impedance targets:** single-ended 50 ohm (50-60); differential 90 ohm or 100 ohm (85 for USB). These traces behave as transmission lines and need continuous reference planes. Set width/space from the actual stackup (use the fab's calculator or the tool's field solver), tolerance typically +/-10%.
- **Differential pairs:** route both legs on the SAME layer if length-matching is required; consistent intra-pair spacing <= 2x trace width; pair-to-pair spacing >= 5x trace width; keep >= 30 mil (or 3x width) clearance to other signals; no components or vias between the two traces; equal via count in both legs; prefer constant loose coupling (~2x width) over tight coupling with discontinuities.
- **Length matching:** match within a fraction of the signal rise time (rule of thumb 20% of rise time; USB 3.x pairs to 5-10 mil). Compensate length in each segment; include via length.
- **3W / return path:** the reference plane should extend >= 3x trace width on each side; do not route over plane splits (the return cannot follow). Add a keep-out along any split to prevent crossing.
- **Termination:** terminate any trace longer than ~1 ft, any trace leaving the shielded enclosure, or any trace longer than ~1/10 wavelength (FCC). Series 50-100 ohm on outputs / 35-50 ohm on inputs, placed at the IC, tames CMOS overshoot. Tie unused inputs directly to ground.
- **Crosstalk:** noise is proportional to parallel run length and inversely to separation (energy falls with the square of distance). Shorten parallel runs, surround noisy traces with ground, and never run noisy traces on the board edge.

### Crystals and oscillators (the most common crosstalk victim)
- Place the crystal as close as possible to its IC, all crystal traces on the SAME layer, crystal closer to the IC than its load caps.
- **Keep unrelated components and all high-speed/switching/clock lines >= 1 inch away** and out of the area directly above/below the crystal on every layer.
- **Load caps:** low-leakage, temperature-stable NPO/C0G Class-1 only. Place the XTAL_IN cap first and closest. Keep the load-cap ground return short and away from USB/power return currents.
- Add a **ground guard ring** around the oscillator tied to the oscillator ground pin / crystal case; put a ground land under the oscillator. Route XTAL_IN and XTAL_OUT as far apart as possible (inter-pin parasitic ≈ 0.5 pF reduces gain margin).
- **Do NOT add series resistors or bypass caps to the oscillator pins themselves** (spacing is the fix). For powered oscillators, do add a bypass cap on the power pin. For a clock-driver supply, isolate it from the main plane with a ferrite bead (impedance > 50 ohm at the clock frequency, ~0 at DC, rated for the DC current).

---

## 9. Silkscreen and self-documentation

The silkscreen is documentation that stays with the board forever; for a caseless board the PCB is the front panel.

- **Board name / revision / date** in silkscreen (shorten to "v1 2026" if tight). At minimum a revision number, incremented before every new order.
- **Pin-1 and polarity indicators:** solid dot/triangle/arrow at pin 1 (do not forget crystals, oscillators, multi-pin LEDs, buttons, switches). "+" on polarized caps (both sides for through-hole). Cathode mark on diodes/LEDs. "~ + -" on bridge rectifiers. Letter the pins on TO-220/247/263 transistors (B/C/E or G/D/S) and regulators (I/G/O).
- **Never place silkscreen (especially RefDes) under a component** (unreadable after soldering) and never over pads, holes, cutouts, or past the board edge.
- **Purpose labels** next to LEDs/buttons/switches/connectors ("Reset", "Power", "+5V"), connector family + pitch, voltage range or max ("8VDC Max"), and barrel-jack center-pin polarity. Use the bottom side if the top is full.
- Use a consistent orientation-mark shape board-wide. Prefer packages that cannot be installed 180-degrees wrong (odd-pin SOT23-5/3, SC70 over SOT23-6) where you have the choice.
- **Fiducials:** add for machine assembly (at least three global fiducials; local fiducials for fine-pitch/BGA).

---

## 10. DRC / ERC (always run, set up correctly)

- Run **ERC** on the schematic and fix every violation (a missed-connection ERC catch prevents bodge wires). Run **DRC** on the PCB with constraints set to the actual fab's spec, not the tool defaults. A board with DRC never set up for the fab spec is a top reviewer complaint.
- Enable schematic-parity / netlist checks so the PCB matches the schematic.
- Do not over-rely on DRC for style; it does not catch the readability and convention issues above.

---

## 11. Pre-fab / pre-review checklist

Run this before requesting an internal review or sending to fab. (Reviewers will not review a board more than once per day, so clean it up first.)

### Schematic
- [ ] Title block complete (name, rev, date, author, sheet N of M); revision incremented.
- [ ] Signal flow left-to-right; power up, ground down; no symbols/text/lines touching.
- [ ] Connected with wires, not a sea of net names; nets named meaningfully; diff pairs `_P`/`_N`.
- [ ] Correct standardized symbols; IC pins grouped by function; power AND ground pins shown for every IC (no hidden power pins).
- [ ] RefDes correct letters, start at 1, no gaps; values present and in one uniform format; standard E-series values.
- [ ] Decoupling cap next to every power pin (drawn next to its part); regulator in+out caps; connector power-pin caps.
- [ ] TVS/ESD on external connectors; pull-ups on open-collector/I2C; unused inputs terminated; MOSFET gates pulled.
- [ ] Symbol pinout verified against the exact ordered package; logic levels compatible.
- [ ] ERC clean.

### Layout
- [ ] Board outline + dimensions correct; fits fab price tier; cutouts on the right layer.
- [ ] Mounting holes placed with correct diameter and both-side keep-outs; aligned to case/connectors.
- [ ] 4-layer (or justified 2-layer with gridding); stackup planned; signals reference a continuous plane.
- [ ] Power/high-current traces widened (IPC-2221); ground pour; no floating copper.
- [ ] Decoupling caps at the pin; crystal close to IC, same layer, guard ring, nothing high-speed under it.
- [ ] Diff pairs same layer, length-matched, spacing rules met; impedance-controlled nets set from the stackup.
- [ ] TVS at the connector; ESD/return paths clean; no high-current/high-speed under crystals/antennas.
- [ ] Silkscreen: board name/rev/date, pin-1/polarity marks (not under parts), purpose labels, fiducials; nothing over pads/edges.
- [ ] DRC clean against the fab's rules; schematic parity passes.
- [ ] Gerbers exported and inspected in an INDEPENDENT viewer, layer by layer; fab's online DFM check run.

---

## 12. AI-assisted design (use it, then verify)

- **Flux Copilot** can answer design questions, read datasheets, search the library, and modify the design with your approval. Its **AI Design Reviews** go beyond ERC: resistor power rating, pull-up/pull-down correctness vs datasheet, capacitor voltage rating (>= 1.5x), and parts availability. Run checks individually to save compute. **FMEA report generation** scores failure modes S x O x D = RPN; RPN > 200 requires mitigation. Caveat: Copilot is strong on schematics, weak on PCB-layout/trace positioning, and thread-scoped (it does not see other chat threads).
- **tscircuit** has scriptable checks: run `tsci check netlist` first, then schematic-placement, snapshot, placement, routing-difficulty before `tsci build`. See the ECAD Tools reference.
- Treat all AI output as a draft to verify against the datasheet and these conventions. Hardware is the source of truth; do not "engineer around" a mismatch to silence a checker.

---

## Sources

- NASA-hosted High-Speed PCB Design Guide (Sierra Circuits): https://s3vi.ndc.nasa.gov/ssri-kb/static/resources/High-Speed%20PCB%20Design%20Guide.pdf
- JLCPCB, Ultimate Guide to PCB Layout Design: https://jlcpcb.com/blog/guide-to-pcb-layout-design
- TI SZZA009 PCB Design Guidelines for Reduced EMI: https://www.ti.com/lit/pdf/szza009
- TI SCAA048 (analog/digital supply filtering / decoupling), SLVA959A (motor-driver layout), SLVA680 (ESD layout), SDYA009C (designing with logic): ti.com/lit
- Analog Devices "Staying Well Grounded" (Analog Dialogue) + AN148: analog.com
- Microchip/Atmel AVR186 Best Practices for PCB Layout of Oscillators: ww1.microchip.com
- Advanced Circuits IPC-2221 Trace Width Calculator: 4pcb.com (-> advancedpcb.com)
- Altium Designer documentation (schematic, high-speed, components/libraries, ActiveBOM, multi-board, harness): altium.com/documentation
- Flux.ai documentation (AI design reviews, FMEA, layout rules, routing, HDI): docs.flux.ai
- r/PrintedCircuitBoard schematic_review_tips and pcb_review_tips community wikis (paraphrased; the wiki carries a no-republish notice).
- Standards: IEEE 315-1975, ASME Y14.44-2008, IPC-2221.
