# PCB Manufacturing & Assembly SOP

Standard operating procedure for taking a finished design to a fabricated, assembled board: what files to send, what to specify, design-for-manufacturing (DFM) and design-for-assembly (DFA) rules, the ordering workflow, and receiving/bring-up. For the design itself see the **PCB Design SOP**. For who to order from see the **PCB Vendor Reference List**. For tool commands and Gerber export see the **ECAD Tools & Commands Quick-Reference**.

Last reviewed: 2026-06-20.

---

## 1. Readiness gate (do not order until all true)

- [ ] DRC clean against the chosen fab's capability sheet (not tool defaults), schematic parity passes, ERC clean.
- [ ] Gerbers exported and inspected layer-by-layer in an independent viewer; the fab's own online DFM/Gerber viewer run and flags resolved.
- [ ] Board name + revision + date in silkscreen; revision incremented from the last order.
- [ ] Mounting holes, board outline, and cutouts verified against the enclosure/mechanical.
- [ ] BOM finalized with manufacturer part numbers and stock confirmed; DNP parts marked.
- [ ] Stackup and impedance requirements documented if controlled impedance is used.

---

## 2. Fabrication deliverables (what you send a fab)

| Deliverable | Format | Notes |
|---|---|---|
| **Gerbers** | RS-274X (extended) | One file per copper / soldermask / silkscreen / paste layer + board outline (Edge.Cuts). RS-274X embeds apertures; avoid legacy 274-D. Many shops also take ODB++ or native KiCad/Altium/EAGLE. |
| **NC drill** | Excellon | Drill sizes + coordinates; distinguish plated (PTH) vs non-plated (NPTH); include slots/cutouts. Add a drill map if the fab wants it. |
| **Netlist** | IPC-D-356 / IPC-356A | Lets the fab electrically test (flying-probe) against intended connectivity. Strongly recommended for multilayer. |
| **BOM** | CSV/XLSX | For assembly: MPN, reference designators, quantity, value/package, DNP marked, preferred distributor/LCSC part numbers. |
| **Centroid / Pick-and-place (CPL)** | CSV | RefDes, X, Y, rotation, layer for every placed part. Required for assembly; SMD-only typically, exclude DNP. |
| **Fab drawing** | PDF | Board outline, dimensions, hole table, stackup, material/finish callouts, tolerances, notes. |
| **Assembly drawing** | PDF | Placement view, pin-1/polarity/cathode marks, special-handling notes. |
| **Stackup notes** | PDF/in fab drawing | Layer order, dielectric thicknesses, copper weights, and impedance targets/tolerance/reference layers. |
| **3D STEP** (optional) | STEP | For mechanical/enclosure fit checks. |

A minimum-viable assembly BOM line carries: RefDes list, description (e.g. "10k 5% 0.125W"), manufacturer + MPN (datasheet link), distributor + distributor PN, package/case (e.g. "SMD 0402"), and quantity per board. A full product BOM also includes wiring/harnesses, mechanical hardware (screws, standoffs, gap pads), enclosure, and batteries; separate PCB vs non-PCB items with BOM variants/sections, and use DNP/DNI entries for assembly variants.

---

## 3. What to specify on the quote

| Parameter | Common choices | Guidance |
|---|---|---|
| **Layer count** | 2 / 4 / 6 / 8+ | Default to 4 for anything non-trivial (see Design SOP). |
| **Board thickness** | 0.6 / 0.8 / 1.0 / 1.6 mm | 1.6 mm standard; 0.8-1.0 mm for small/flex-adjacent or weight-sensitive. |
| **Copper weight** | 0.5 / 1 / 2 oz | 1 oz default; 2 oz+ for power. Inner layers often 0.5 oz on cheap multilayer. |
| **Surface finish** | HASL / **ENIG** / OSP / Imm. Ag/Sn / hard gold | HASL cheapest (leaded or lead-free, uneven). ENIG flat, ideal for fine-pitch/BGA, longer shelf life, costs more. Hard gold for edge connectors. |
| **Soldermask / silk color** | Green / others | Green is cheapest and fastest; other colors may add cost/lead time. |
| **Min trace/space** | 6/6, 5/5, 4/4 mil, HDI | Confirm the design's smallest feature is within the chosen process. |
| **Controlled impedance** | yes/no + target/tol/layers | If yes, provide the stackup and the target (50 ohm SE, 90/100 ohm diff), tolerance +/-10%. |
| **Via type** | through / blind / buried / micro; via-in-pad filled | JLCPCB is through-hole only; PCBWay/others do blind/buried/HDI. |
| **IPC class** | Class 2 / Class 3 | Class 2 general; Class 3 high-reliability (aero/medical/defense). |
| **Panelization** | single / panel / V-score / tab-route | Provide fiducials + tooling holes + rails for SMT assembly. |
| **Material** | FR-4 (Tg), high-Tg, Rogers/PTFE, aluminum/metal-core, polyimide | RF -> Rogers; thermal -> metal core; flex -> polyimide. |
| **Quantity + lead time** | standard vs quick-turn | Quick-turn carries a premium. |
| **Assembly extras** | sides, stencil, conformal coat, test, programming, ITAR | Specify if PCBA. |

---

## 4. Recommended stackups

- **2-layer (1.6 mm):** Signal / GND-pour-and-signal. Acceptable only for simple/low-speed boards; grid the ground (see Design SOP). Cheapest.
- **4-layer (1.6 mm, default for real designs):**
  - Higher density: GND / Signal+Power / core / Signal+Power / GND.
  - Lower density: Signal+Power / GND / core / GND / Signal+Power.
  - Symmetric; every signal layer references a continuous plane.
- **6-layer:** when 4 cannot give continuous planes for the high-speed nets; place high-speed signals adjacent to ground, keep power-plane pairs tightly coupled.
- Keep the stackup symmetric, <= 3 prepreg types each < 10 mils, and request the fab's standard impedance-controlled stackup if you need controlled Z (most fabs publish one, e.g. JLCPCB's 4-layer impedance stackup).

---

## 5. Panelization and assembly prep (DFA)

- **Fiducials:** at least 3 global fiducials on the board/panel (1 mm copper dot + mask opening), asymmetrically placed; local fiducials near fine-pitch/BGA. Required for automated optical placement.
- **Tooling holes:** non-plated, typically 3 mm, near the panel corners for assembly fixturing.
- **Panel rails:** add 5-10 mm rails on two sides for SMT conveyor clamping if individual boards are small.
- **Depaneling:** V-score for straight edges; mouse-bites/tab-route for irregular outlines or to keep edge components clear. Keep parts back from V-score lines.
- **Courtyards/clearances:** respect part courtyards; keep tall parts out of height-restricted zones; keep components back from board edges per fab rule.
- **Assembly side(s):** decide single vs double-sided reflow; heavy/through-hole parts and connectors affect process and cost.

---

## 6. DFM / DFA checklist

- [ ] Smallest trace/space and smallest drill are within the fab's published minimums (with margin).
- [ ] Annular ring and via-to-copper clearances meet the process; aspect ratio <= 1:10 (through), <= 1:0.75 (microvia).
- [ ] No silkscreen over pads/holes/cutouts or off the board edge; silk line width >= fab minimum (commonly 6 mil).
- [ ] Soldermask slivers/dams between fine-pitch pads meet minimum mask web.
- [ ] Acid traps / acute angles cleaned up; no copper slivers.
- [ ] Board outline is a single closed contour on the outline layer; cutouts/slots defined.
- [ ] Fiducials + tooling holes present (if assembling); pick-and-place rotations sane.
- [ ] Thermal reliefs on plane connections for hand-solderable through-hole parts.
- [ ] Edge clearance for copper and components per fab; mounting-hole keep-outs both sides.
- [ ] Test points / programming header accessible.

---

## 7. Ordering workflow

1. **Pick the vendor** (see PCB Vendor Reference List). Sensible default: prototype on **JLCPCB** (cheapest/fastest) unless the design needs HDI/blind-buried/rigid-flex (-> **PCBWay**) or must be US-made / ITAR (-> **MacroFab**, **CircuitHub**, **Advanced Circuits**, **Sierra**).
2. **Run the vendor's instant quote**: upload Gerbers (+ BOM + CPL for assembly). Set the spec from section 3.
3. **Run the vendor's online DFM / Gerber viewer** and resolve every flag before paying. Compare to your independent viewer inspection.
4. **For assembly**, confirm part availability and basic-vs-extended status (JLCPCB charges extra setup for extended/feeder parts); decide turnkey vs consigned/kitted; order a stencil if you will hand-assemble.
5. **Compare landed cost, not just board price**, when weighing China vs domestic (import duties on China-origin boards change frequently).
6. **Save the order**: keep the exact Gerber/BOM/CPL zip, the quote, and the rev tied to the order in the project folder.

---

## 8. Assembly options

- **Turnkey:** the vendor sources all parts, fabs, and assembles. Easiest; best for production and when parts are common. JLCPCB/PCBWay/MacroFab/CircuitHub.
- **Consigned / kitted:** you supply some or all parts (for rare/long-lead/controlled parts), vendor assembles. Screaming Circuits and most US houses support partial turnkey.
- **Stencil + hand assembly:** order an SMT stencil (framework or frameless) with the board; reflow in-house. Good for the cheapest prototypes and for parts you do not want a vendor to source.
- **Mind solderability vs your skill / equipment:** beginners and hand-assembly favor 0805/1206 and 1.27 mm-pitch SO/DIP; avoid BGA/CSP/WLP without X-ray inspection access.

---

## 9. Receiving, inspection, and bring-up

- **Incoming inspection:** verify board count, dimensions, finish, silkscreen legibility, and obvious defects. For assembled boards, AOI/X-ray the vendor provides covers a lot, but spot-check polarity, pin-1, and BGA/QFN solder under magnification.
- **Power-up safely:** current-limited bench supply first, watch inrush and quiescent current against the expected value before connecting loads. Check each regulator output voltage at its test point.
- **Bring-up checklist:** confirm rails, then clocks/crystals, then communication buses, then peripherals. Use the test points and silkscreen labels you designed in.
- **Log issues against the revision** and feed fixes into the next rev (the silkscreen rev number is why we increment it every order).

---

## 10. Cost and lead-time levers

- Fit the board to a fab fixed-price tier (e.g. both dimensions <= 100 mm for JLCPCB's price break; 102 x 100 loses it).
- Green soldermask + HASL + standard FR-4 + standard lead time is cheapest. ENIG, non-green colors, controlled impedance, quick-turn, and exotic materials each add cost.
- Panelize small boards to cut per-unit fab and assembly cost.
- Use the fab's basic/preferred parts library for assembly to avoid extended-part feeder setup fees; design around stocked passives.
- Order an extra few boards; the marginal board cost on a panel is low and saves a reorder cycle.

---

## Sources

- NASA/Sierra High-Speed PCB Design Guide (DFM aspect ratios, stackup): s3vi.ndc.nasa.gov
- JLCPCB, PCBWay capability pages and the PCB Vendor Reference List (this folder).
- Altium "What is a BOM in PCB design": resources.altium.com
- r/PrintedCircuitBoard pcb_review_tips (panelization, mounting holes, fab-tier sizing): old.reddit.com/r/PrintedCircuitBoard
- IPC standards referenced: IPC-2221 (trace/clearance), IPC-A-600/IPC-A-610 (acceptability), IPC-D-356 (netlist), IPC-2581/ODB++ (data exchange).
