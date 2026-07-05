# Flex and Rigid-Flex PCB SOP (Design, Manufacturing, Tools)

How to design and build flexible (FPC) and rigid-flex printed circuits, with a heavy emphasis on the practical path: design in EasyEDA Pro (or KiCad), fab at JLCPCB. Blends industry standards and best practices (IPC, fabricator design guides) with concrete, tool-specific how-to.

Last updated: 2026-07-04. Point-in-time facts (fab capabilities, tool features, pricing, IPC revisions) drift; re-verify against the cited source before you rely on them. This is a living doc, extend the results/notes as we build real flex boards.

Companion docs in this folder: **PCB Design SOP** (general design + review), **PCB Manufacturing & Assembly SOP** (deliverables, stackups, DFM/DFA), **ECAD Tools & Commands Quick-Reference** (section 3 = EasyEDA), **PCB Vendor Reference List** (fab directory).

---

## 0. Read this first: two corrections that change everything

The single most common misconception (including in most YouTube "flex-rigid in EasyEDA" tutorials) is that you can casually mix rigid and flex regions in a free tool and get a true rigid-flex board from JLCPCB. You cannot, as of this writing. Two hard facts:

1. **JLCPCB builds flexible PCBs (FPC) in 1, 2, and 4 layers only. It does NOT build true rigid-flex.** Their flex capabilities page states verbatim: "Rigid-flex PCBs are not yet supported." The JLCPCB blog articles about rigid-flex are educational SEO content, not an offer to build one. (https://jlcpcb.com/capabilities/flex-pcb-capabilities)

2. **EasyEDA (Pro) does not model true rigid-flex either.** It implements a single flexible board (FPC) plus **stiffener regions**. There is no per-region stackup, no independent copper-layer counts per zone, no defined rigid/flex transition, and no bending-line primitive. The video's "make this rectangle FR4 1.6mm" is really placing an **FR4 stiffener**, not a rigid substack. (https://prodocs.easyeda.com/en/pcb/place-fpc-stiffener/)

The pragmatic conclusion: **model rigid-flex as "flex board + stiffeners in the rigid zones."** This is genuinely manufacturable and orderable at JLCPCB. Reserve the phrase "rigid-flex" for the real thing (independent multilayer substacks laminated through a continuous flex core), which requires a professional tool (Altium/OrCAD/Xpedition) and a rigid-flex fab house (PCBWay, Sierra/ProtoExpress), not JLCPCB. See sections 8 (JLCPCB), 9 (EasyEDA), 10 (tools).

---

## 1. Fundamentals and terminology

### What they are
- **Flex PCB (FPC, flexible printed circuit):** conductors photo-etched on a thin flexible dielectric (almost always polyimide/Kapton) so the whole board or defined zones bend, fold, or flex. High density, no wiring errors, can replace a wire harness at up to ~75% space saving.
- **Rigid-flex PCB:** one hybrid structure that laminates rigid sections (FR4) and flexible sections (polyimide) together, with the flex conductors running continuously through both and interconnected by plated holes in the rigid areas. Gives component support plus 3D foldability and removes board-to-board connectors/cables.
- **"Flex-rigid" vs "rigid-flex":** same construction, terms used interchangeably (IPC-2223 titles it "Flexible / Rigid-Flexible").

### The decision: which construction to use
Work down this list and stop at the first one that meets the need (cost rises as you go down):

1. **Rigid board + connector + cable/FFC.** Cheapest when the interconnect is simple. Downside: connectors and cables are a leading field-failure cause (wear, vibration, mis-wiring).
2. **Flex circuit with stiffeners** (the default for anything bendable at JLCPCB). Bendable interconnect plus a few local rigid zones (connectors, dense component clusters) backed by stiffeners. Much cheaper than rigid-flex, and it is what JLCPCB actually builds. Always check whether stiffeners suffice before specifying true rigid-flex.
3. **True rigid-flex.** Only when you need genuine 3D packaging, high shock/vibration reliability, high layer count across multiple rigid islands, or elimination of roughly 5 or more connectors (a common economic breakeven). Highest per-unit fab cost, but potentially lowest total cost of ownership in complex systems. Requires a pro tool and a rigid-flex fab.

### Types (IPC-6013 construction classes)
- **Type 1, single-sided flex:** one conductor layer. Cheapest, most flexible, the only type truly suited to dynamic (repeated) flexing. Can be "dual-access" (openings both sides) via laser skiving.
- **Type 2, double-sided flex:** two conductor layers with plated through-holes (PTH).
- **Type 3, multilayer flex:** 3+ conductor layers with PTH.
- **Type 4, rigid-flex:** 2+ conductor layers combining rigid and flexible dielectric, PTH through both.
- **Type 5:** 2+ layers without PTH (uncommon).
- **Sculptured flex:** variable-depth etching so copper is thick/raised at terminals (strength, connectorless plug-in ends) and thin in bend regions (flexibility).
- **Semi-flex ("bendable rigid"):** a rigid FR4 board locally depth-routed thin so one zone bends a limited number of times (usually bend-to-install). Cheaper than rigid-flex; cracks under repeated bending. Good for static, cost-sensitive assemblies.

### Static vs dynamic (and cycle expectations)
Bending puts the inside of the bend in compression and the outside in tension. If tensile strain exceeds copper ductility, the copper work-hardens, embrittles, and cracks. That physics drives every rule below.

- **Flex-to-install (static):** bent once to shape, then fixed. Roughly under ~100 flexes in the product's life. Any layer count.
- **Semi-dynamic:** a limited, known number of service/access cycles (Multi-CB caps this at ~20 bends). Needs larger radius, thinner flex.
- **Dynamic flex:** continuous repeated flexing in operation (printer heads, hinges, disk actuators, robot joints). Practically limited to 1-2 layers (1 preferred, copper on the neutral axis). Good designs hit very high cycle counts: JLCPCB cites 10,000+ cycles at a 20 mm radius (per IPC-6013 / IPC-TM-650 2.4.3), coverlay constructions exceeding 200,000 bends, and wearable cases beyond 500,000 cycles.
- **One-time crease (zero-radius fold):** folded flat and held with pressure-sensitive adhesive. Thin materials, thin copper, 1-2 layers only.

---

## 2. Materials and stackup

### Base film and copper
- **Polyimide (Kapton)** is the dominant flexible dielectric: continuous >260 C, dimensionally stable, flame retardant, high dielectric strength. Common thicknesses 0.5, 1, 2, 3 mil (12.5 to 75 um). Low-cost **PET/polyester** exists but tops out ~105 to 120 C, generally cannot survive reflow, so it is limited to simple single/double-layer boards (costs ~3 to 8x less than PI).
- **Rolled-annealed (RA) vs electrodeposited (ED) copper.** RA copper has an elongated horizontal grain that resists fatigue cracking, so **RA is required for dynamic flex and preferred for all flex**. ED copper has a brittle columnar grain, acceptable only for static/semi-dynamic. (JLCPCB does not expose an RA/ED picker in the order form; confirm with support if you need RA for a dynamic-bend design.)
- **Copper weights:** 1/4 oz (9 um), 1/3 oz (12 um), 1/2 oz (17 um), 1 oz (35 um), 2 oz (70 um). Thinner = more flexible. For higher current, prefer **wider traces over thicker copper** (thick copper needs thicker coverlay adhesive and stiffens the flex).

### Laminate: adhesive vs adhesiveless
- **Adhesive laminate:** copper bonded to PI with flexible acrylic or epoxy adhesive. Cheaper, but acrylic softens when heated, absorbs moisture, and is the "Achilles heel" of PTH reliability in rigid-flex (via barrel cracking).
- **Adhesiveless laminate:** copper cast directly to PI, no acrylic. Thinner, more thermally stable, higher peel strength, better for high-speed/HDI/dynamic. Costs ~30 to 50% more. Modern designs default to adhesiveless. (JLCPCB's standard FPC core is 100% adhesive-free polyimide.)

### Coverlay vs flexible solder mask
- **Coverlay (coverfilm):** PI film with adhesive, punched/laser-cut open at pads (openings are round/oval only) then laminated. The flex equivalent of solder mask; protects better, auto-covers vias, amber color. Use for dynamic and static.
- **Flexible/photo-imageable solder mask (LPI/PIC):** liquid, any opening shape and finer pitch, green, does NOT auto-cover vias. More brittle, may crack/peel after ~5 to 10 bends, so semi-dynamic/static zones only, never dynamic.
- Coverlay thickness scales with copper weight (Sierra): 0.5 oz Cu -> ~1 mil coverlay, 1 oz -> ~1.5 mil, 2 oz -> ~3 mil. Account for adhesive squeeze-out around pads and access holes.

### Bondply, prepreg, stiffeners, shielding
- **Bondply:** film with adhesive on both sides, bonds flex layers together. (Coverlay = adhesive on one side.)
- **No-flow (low-flow) prepreg:** used in the rigid-to-flex transition so resin does not bleed onto the flexible "wings" and stiffen them.
- **Stiffeners** (localized rigid backing under connectors, SMT areas, or ZIF fingers to stop pad peel and support insertion force):
  - **Polyimide (PI):** thin (0.025 to 0.225 mm), for stiffeners under ~10 mil and gold-finger insertion.
  - **FR4:** 0.075 to 3.20 mm; do not go below ~5 mm width (breaks/carbonizes). JLCPCB flags FR4 as low-end and chip-prone.
  - **Stainless steel:** best flatness/rigidity for chip mounting; weakly magnetic, so keep away from Hall sensors; never over exposed pads (shorts).
  - **Aluminum:** heat spreading/support.
  - Rules: SMT stiffener goes on the side opposite the components; through-hole stiffener on the same side as the connector; overlap the coverlay by ~30 mil (Sierra) and extend at least 1.0 mm beyond gold-finger pads (JLCPCB); ZIF stiffeners are commonly 0.20 to 0.30 mm.
- **EMI shielding film:** dielectric + conductive layer + Z-axis conductive adhesive, laminated over the flex. Must be grounded (coverlay opening ~1x1 mm over a ground plane); an ungrounded film re-radiates. JLCPCB's option is 18 um black film.
- **Silver ink / conductive epoxy:** screen-printed conductors/shields, more flexible than copper foil, used for crossovers, shields, membrane switches.

### Typical stackups
- **1-layer:** coverlay / adhesive / copper / PI substrate (+ optional stiffener).
- **2-layer:** coverlay / Cu / PI core / Cu / coverlay, PTH interconnect.
- **Rigid-flex rule of thumb:** put the flex layers in the **center** of the stackup (protects them, eases handling, helps impedance), use an **even, symmetric** layer count balanced about the flex core (asymmetry is the leading cause of warpage).

### Air-gap / unbonded ("bookbinding") construction
For higher layer counts, do NOT fully laminate the flex layers together in the bend region. Use unbonded / air-gap / loose-leaf / bookbinding construction: the flex layers move independently, kept loose in the bend by no-flow prepreg or release film while the rigid areas stay bonded. Lets a rigid-flex fold 180 degrees or more (costs ~30% more than standard rigid-flex), and removes flex adhesive from the rigid PTH area (better via reliability). Impedance caveat: never unbond a signal layer from its reference plane, they must stay bonded or buckling creates impedance mismatch.

---

## 3. Design best practices and rules of thumb (the core section)

### Minimum bend radius
Radius R as a multiple of total finished flex thickness (PI substrate + copper + adhesive + coverlay, both sides). Bend radius is measured on the **inside** of the bend. Two conventions coexist in the literature; both are IPC-2223-derived. Use the mainstream "multiple of thickness" convention below as the conservative default, and confirm with your fab.

| Application | Layers | Min bend radius |
|---|---|---|
| Static / flex-to-install | 1 (single-sided) | 6x thickness |
| Static / flex-to-install | 2 (double-sided) | 12x |
| Static / flex-to-install | Multilayer (3+) | 12x to 24x (Sierra 24x, Epec "12x or greater") |
| Dynamic | 1 layer | ~100x |
| Dynamic | 2+ layers | 100x to 150x (multilayer dynamic not recommended) |

- **Add a 20 to 30% safety margin** to the calculated minimum (lot variation, tolerance, handling).
- Minimize layers in the bend zone, each layer raises thickness and therefore the minimum radius.
- Worked examples (Multi-CB, bend-ratio convention): 90 um single-layer -> ~0.9 mm static / ~9 mm dynamic; 190 um 2-layer -> ~1.9 mm static / ~29 mm dynamic. Practical minima usually land 1 to 5 mm.

### Routing in bend zones (most important rules)
- Route traces **perpendicular to the bend line** (cross at 90 degrees), keep them **straight and uniform** through the bend.
- **No vias, pads, plated holes, or components in the bend area.** Rigid features are stress risers. Clearances: keep PTH at least 20 mil from the bend (Sierra) / 1 mm from the flex area (Multi-CB); vias 30 to 50 mil back from the rigid-flex interface; JLCPCB via-to-bend 1.0 mm static, 1.5 mm dynamic; components/stiffeners at least 2.5 mm from the bend.
- **No change of construction in or next to the bend:** no change in conductor width/thickness/direction, no coverlay openings, no plating termination, no holes.
- **Curved/rounded traces, never 90-degree or sharp corners.** For length compensation use large-radius serpentine, not tight zig-zags.
- **Teardrops/fillets at every pad-to-trace and via junction**, and taper (neck) the trace into the pad. Teardrop especially any trace narrower than 20 mil.
- **Split wide traces** into several narrower parallel traces through the bend; fill open bend areas with dummy conductors to distribute stress.

### Neutral axis, staggering, I-beam, hatched planes
- **Neutral bend axis:** the mid-plane sees no net strain, put copper near it (a reason 1-layer suits dynamic). Route small conductors (<10 mil) on the inside of a tight bend (compression is gentler than tension).
- **Stagger traces on double-sided/multilayer flex.** Never stack top traces directly over bottom traces, that creates a stiff "I-beam" that resists bending and concentrates stress. Offset so top traces sit in the gaps between bottom traces.
- **Cross-hatch (raster) copper pours/planes instead of solid copper** in flex/bend areas. Solid copper cracks like a stiff tape measure; a hatched plane stays supple and still provides a ground return. Typical hatch: Sierra 15 mil trace / 25 mil space; JLCPCB 0.38 mm / 0.63 mm, or 0.2/0.2 mm at 45 degrees. For controlled impedance over flex, run a small solid reference strip (~2x the signal width) directly under the signal trace, hatched fill elsewhere.

### Copper balance, pads, plating
- Keep **copper balanced/symmetric** across the stackup (prevents warp/twist).
- **Larger annular rings than on rigid** (at least >8 mil), copper adhesion to PI is weaker than to FR4. Use **anchoring spurs / hold-down tabs** and **filleted/teardropped pads** to resist peel. Offset overlapping pads front/back.
- **Button plating (pad-only / selective plating):** plate copper only in holes and on pads, keeps the flex thin and flexible. Standard flex method (adds process cost).
- Keep drill-to-copper ~8 mil; keep the same layer count/construction in all PTH areas. **Never via-in-pad on flex** (no resin plug possible, solder wicks).

### Rigid-to-flex transition zone
- **Keep the bend line away from the rigid-flex boundary**, do not bend right at the transition.
- **No PTHs straddling the boundary**, keep all PTHs in the rigid area, vias 30 to 50 mil back.
- **Add teardrops/fillets and gradual (tapered) transitions**, no abrupt width/thickness change.
- **Strain relief:** a bead of semi-rigid adhesive along the interface distributes stress.
- **"Bikini" / cut-back coverlay:** apply coverlay only over the flex and cut it back so it does not intrude into the rigid section (intruding coverlay adhesive causes delamination during assembly).
- **Controlled vs uncontrolled transition:** a controlled transition uses defined coverlay cut-back, filleted corners, and a strain-relief bead/stiffener so the hinge is deliberately located. An uncontrolled transition lets the flex hinge randomly at the rigid edge (the #1 transition-zone crack cause). Rigid islands joined by flex should be at least ~0.375 in apart, preferably 0.5 in+.

### Tear prevention and geometry
- End every slit/notch with a **relief hole**, use large corner radii, no sharp inside corners. Add anti-tear copper strips (or hatched copper on the back) at sparse edges/corners.
- Minimum flex-area length ~4 mm; ~10 mil clearance between adjacent flex regions. If the bend has no traces, add circular cutouts (radii >30 mil) to reduce deformed material.
- Use **solder-mask/coverlay-defined pads** for connectors and gold fingers (coverlay overlapping the pad rim by >0.3 mm anchors the pad against peel).

---

## 4. IPC standards (what each governs)

Design:
- **IPC-2221** - generic PCB design (the base document).
- **IPC-2223** - sectional design standard for Flexible / Rigid-Flexible boards. The core flex **design** standard (bend radius, board types, transition construction, coverlay, stiffeners, routing). This is what a flex designer works to.

Materials:
- **IPC-4202** - flexible base dielectrics (the PI base film).
- **IPC-4203** - cover and bonding materials (coverlay, cover sheets, bondply).
- **IPC-4204** - flexible metal-clad dielectrics (copper-clad flexible laminate). (Fab-note example: "flexible copper-clad per IPC-4204/11; coverlay per IPC-4203/1.")

Performance / qualification:
- **IPC-6013** - qualification and performance for Flexible / Rigid-Flexible boards (current Rev E, 2021). The core flex **acceptance** standard. Defines Types 1-5; Use Classes A-D (A = flex during installation, B = continuous flexing to a cycle count, C = high-temp >105 C, D = UL recognition); and Performance Classes 1/2/3 (1 = consumer, 2 = dedicated service, 3 = high-reliability/life-critical). Do not over-specify class, it costs money.
- **IPC-6011** - generic performance framework; **IPC-A-600** - visual acceptability.

Testing/other: **IPC-2152** (current-carrying capacity), **IPC-9252** (bare-board electrical test), **IPC-TM-650 2.4.3** (dynamic flex endurance test, referenced by 6013), **MIL-PRF-31032 / MIL-P-50884** (military flex specs).

---

## 5. Common failure modes and how design avoids them

- **Copper trace cracking / fatigue** (outer-bend tension, work-hardening). Fix: RA copper, larger radius + margin, thin copper, traces perpendicular/straight through the bend, hatched planes, staggered layers, form only once.
- **Delamination** (coverlay/adhesive lift, air pockets, moisture, coverlay intruding into rigid). Fix: adhesiveless laminate, no-flow prepreg, bikini/cut-back coverlay, void-free lamination, bake before assembly.
- **PTH barrel cracking** (Z-axis CTE of PI/acrylic pulls the via barrel during reflow). Fix: keep PTHs in rigid not flex, adhesiveless/air-gap construction, plasma desmear, button plating, teardrops at via pads, vias 50 mil back from the transition.
- **Pad lifting / peeling** (weak Cu-to-PI adhesion, connector insertion force). Fix: anchoring spurs, teardrops, larger annular rings, SMD-defined pads, offset front/back pads, stiffeners under connectors.
- **Tearing at slits/notches/corners.** Fix: relief holes at slit ends, large corner radii, tear guards, no sharp inside corners.

---

## 6. Cost and manufacturability drivers

- **Layer count** is the single biggest driver (material, process steps, alignment, yield).
- **Rigid-flex vs multilayer-flex-with-stiffeners:** rigid-flex is typically more expensive; check whether stiffeners suffice first.
- **Class:** Class 3 > Class 2 in cost. Don't over-specify.
- **Controlled impedance on flex** forces thicker dielectrics/more layers (stiffer, costlier) and needs field-solver modeling (hatched planes shift impedance).
- **Number of rigid islands, board size/shape, panel utilization:** nest efficiently; small outline tweaks that fit more parts per panel cut cost.
- **Materials:** adhesiveless ~30 to 50% over adhesive; PI ~3 to 8x PET; material is ~40 to 60% of rigid-flex cost.
- **Volume:** rigid-flex per-board cost is high but total cost of ownership drops with volume (common breakeven ~500 units, or any design eliminating ~5+ connectors).
- **Why rigid-flex is expensive to build:** costly PI, low-yield sequential/vacuum lamination with book constructions and no-flow prepregs, and mandatory **plasma etching** to desmear PI holes (chemical desmear does not work on PI).

---

## 7. JLCPCB flex manufacturing (the target fab)

Point-in-time snapshot, early July 2026, from JLCPCB's own capabilities/help/blog pages. Re-verify before committing. Primary: https://jlcpcb.com/capabilities/flex-pcb-capabilities

### What JLCPCB offers
- **Flexible PCB (FPC) in 1, 2, and 4 layers.** No 3/6/8-layer flex. **No rigid-flex** (model rigid zones with stiffeners instead, see section 0).
- **Base:** 100% adhesive-free polyimide; PI dielectric 25 um or 50 um; transparent PET option (36 um) for 1-2 layer.
- **Coverlay colors:** yellow (recommended), black, white, transparent. White adds ~10 to 18 um/side (changes finished thickness / connector fit).
- **Copper:** 1-layer 0.5 or 1 oz; 2-layer and 4-layer 1/3, 1/2, or 1 oz.
- **Stiffeners:** PI (0.1/0.15/0.2/0.225/0.25 mm), FR4 (0.1 up to 1.6 mm), stainless steel (0.1/0.2/0.3 mm), plus 3M/tesa tape backing and 18 um EMI shielding film. (tesa8854 0.1 mm is the recommended heat-resistant tape.)
- **Surface finish:** ENIG only (1 or 2 u"). No HASL/OSP on flex.
- **Impedance:** NOT tested or guaranteed on flex. They publish reference trace widths giving roughly +/-20% tolerance. For your own calc: core PI Dk ~3.3, coverlay ~2.9. Prototype and measure; the 50 um 2-layer stack is the one they flag as suitable for impedance work.

### Key design rules (regular capability, re-verify)
| Parameter | Value |
|---|---|
| Min trace/space | 3/3 mil (1/3 oz), 3.5/3.5 mil (1/2 oz), 4/4 mil (1 oz); absolute floor ~2/2 mil (extra cost) |
| Trace width tolerance | +/-20% |
| Min via (hole/pad) | 0.3 / 0.55 mm regular; 0.1 / 0.3 mm 2-layer extreme (extra cost) |
| Via pad vs hole | pad at least 0.2 mm larger than hole (0.25 mm+ preferred) |
| PTH annular ring | >=0.25 mm (absolute 0.18 mm) |
| Hole size range | 0.1 to 6.5 mm (recommend max PTH 5 mm), tolerance +/-0.08 mm |
| Copper to board edge | >=0.3 mm |
| Coverlay opening | +0.1 mm expansion, opening-to-trace >=0.15 mm; keep coverlay over vias |
| Max board size | 234 x 490 mm regular (250 x 600 mm with rails, confirm with support) |
| Min board | panelize anything under 20 x 20 mm |
| Outline tolerance | +/-0.1 mm (+/-0.05 mm on request), laser cut |
| Gold-finger pad to edge | 0.2 mm (or JLC trims fingers back) |

### Ordering workflow
1. Instant quote at cart.jlcpcb.com/quote, set **base material = Flexible** (the capabilities-page quote link pre-selects the flex plate).
2. Upload a standard Gerber + drill set, zipped (same format as rigid). The quote page renders a layered viewer, review DFM there.
3. Set FPC fields: layer count, dielectric/finished thickness, copper weight, coverlay color, ENIG, stiffener type/thickness. (Impedance is not an orderable option.)
4. **Communicating stiffeners/coverlay/outline:**
   - **Best path (EasyEDA Pro):** Place > FPC Stiffener embeds the stiffener geometry AND material/thickness into the Gerber pack, so JLC auto-prices/auto-produces without manual re-entry. See section 8.
   - **Other tools (KiCad, etc.):** there is no standard stiffener layer, so draw stiffener outlines on a dedicated annotation/mechanical layer with a text note (material + thickness), keep the note off the board area, AND also select the stiffener options manually in the order form. JLC does NOT auto-parse text in the zip. Coverlay openings ride the coverlay/soldermask Gerbers; outline rides the mechanical layer.
5. **Coverlay behaves as the soldermask layer** (pre-windowed before lamination): keep >=0.2 mm pad-to-trace, >=0.5 mm pad-to-pad; for tighter pitch use a single bridged coverlay window.

### Pricing and lead time (volatile, re-check at quote)
- Flex proto promo: **$25 for 5 pcs** (https://jlcpcb.com/RGE/FlexPCB). Roughly 10x+ the base price of a comparable small rigid proto (~$2/5 pcs), still cheap absolute. Stiffeners, ENIG, extreme trace/via, larger area, and 4-layer all add cost.
- **MOQ 5 pcs. Build time ~5 to 6 days** (vs 24 to 48 h for standard rigid); order-to-doorstep ~1 to 3 weeks with shipping.
- Flex often ships on a panel/carrier with support tabs by design, that is normal, not a defect (you depanel).

### JLCPCB flex DFM gotchas
1. Do not assume rigid-flex, it is not offered. Model rigid zones with stiffeners.
2. **No via-in-pad on flex** (solder wicks, thin core cannot be resin-plugged). Keep coverlay over vias, vias >=0.2 mm from openings.
3. **Impedance is uncontrolled** (~+/-20%). Prototype to verify.
4. **Thin 25 um core -> pads tear off.** Use coverlay-defined pads, connect pad corners to copper, offset opposed pads.
5. **Large solid copper oxidizes/blisters** under the coverlay. Use cross-hatched copper + vent windows.
6. **Gold fingers:** shrink ~0.2 mm (laser carbonization micro-shorts), coverlay overlap >=0.3 mm, stiffener >=1.0 mm beyond the pad.
7. **Stiffener miscommunication is a classic scrap cause.** Use EasyEDA Pro (embeds it) or annotate clearly AND set it in the order form.
8. **Steel stiffener is magnetic** (keep off Hall/magnetic sensors); **FR4 stiffener chips** (prefer PI or steel).
9. **Panelize small/fragile flex** (5 mm handling rails all four sides, 2 mm inter-board spacing / 3 mm with metal stiffeners, tabs 0.7 to 1.0 mm, fiducials 1 mm, tooling holes 2 mm).
10. **Bend-zone discipline:** no vias/pads/components/stiffeners in the bend, cross-hatch copper, stagger layers, radius per IPC-2223 with 20 to 30% margin.

---

## 8. EasyEDA flex workflow (the practical design path for JLCPCB FPC)

Reality check up front (see section 0): EasyEDA implements **a single flexible board (FPC type) plus stiffener regions**, not true rigid-flex. That is fine, because it maps exactly to what JLCPCB builds.

### EasyEDA Standard vs Pro
- **EasyEDA Standard (easyeda.com/editor):** NO flex/FPC support. The Layer Manager has no PCB-type toggle and no stiffener layers. You could hand-annotate stiffeners on a custom layer, but there is no built-in flex tooling. Do not use Standard for flex.
- **EasyEDA Pro (pro.easyeda.com):** the editor that supports flex (added in v2.0). Provides a **PCB Type** setting (Ordinary board / FPC soft board), two dedicated **stiffener layers**, a **Place > FPC Stiffener** region tool with per-region material + thickness, a foldable **3D preview**, and **one-click JLCPCB ordering** with stiffener parameters embedded in the Gerbers.
- EasyEDA Pro does NOT have: a true rigid-flex stackup manager, per-area layer counts, Altium-style bending-line primitives, or an automated rigid/flex transition tool.

### Where the features live (Pro UI)
- **Tools > Layer Manager** -> "PCB Type" (Ordinary / FPC soft board) and "Physical Stacking" (record substrate/dielectric materials + thickness).
- **Place > FPC Stiffener** -> draw a stiffener region (rectangle/circle/polygon) or import a DXF and right-click convert. Set material + thickness in the right-hand Properties panel. Use the **Boolean** function to hollow out the stiffener where pads/components must be accessible underneath.
- **Place > Stack Table** -> drop a stackup documentation table on the drawing.
- **Place > Board Outline** -> board shape.

### Step-by-step: an FPC (flex) board in EasyEDA Pro
1. **Tools > Layer Manager, set PCB Type = FPC soft board (flexible).** Top and bottom each gain a stiffener layer. (Placing a stiffener on a board set as rigid also auto-switches it to FPC.)
2. **Set layer count** (JLCPCB flex = 1 to 4 layers).
3. **Account for thin copper** (FPC outer copper is often ~1/3 oz vs 1 oz on rigid), widen power traces.
4. **Draw the board outline** (Place > Board Outline).
5. **(Optional) Physical Stacking:** set dielectric/coverlay materials/thickness. Note this is **record-only**, it affects the 3D preview / 3D model / ODB++ but NOT the Gerbers or impedance; you re-select the real stackup on the order page.
6. **Route** per section 3 (perpendicular through bends, curved traces, teardrops, hatched pours, no vias/pads in bends). Note: EasyEDA DRC does NOT enforce flex/bend rules, that is on you.
7. **Place stiffeners** (Place > FPC Stiffener) over connector zones, component-soldering zones, and any area that must stay rigid. Set material (PI / FR4 / steel / 3M tape / EMI film) + thickness. Boolean-cut where pads need access.
8. **Verify in 3D:** stiffened areas render rigid, bare FPC areas render foldable. This is a visualization aid, not a mechanical/bend simulation.
9. **DRC, then one-click order or Export > PCB Fabrication File (Gerber).** Stiffener geometry + parameters are written into the Gerber pack automatically.

Bend lines: EasyEDA has no bend-line primitive. The "bend region" is simply where you did NOT place a stiffener. If you need to communicate an explicit bend axis/radius, add a note/dimension on a documentation layer and confirm with JLCPCB.

### Step-by-step: emulating rigid-flex in EasyEDA Pro
1. Set PCB Type = FPC flexible (whole board is flexible PI).
2. Route the complete board across all intended rigid and flex zones as one continuous flex board.
3. Place **FR4 (or steel) FPC Stiffener regions over the zones that must be rigid** (mounting areas, dense clusters, connector footprints), realistic thickness.
4. Leave stiffeners off the bend zones.
5. Assign each stiffener's material/thickness; Boolean-cut for pad access.
6. 3D-preview to confirm, DRC, order.

When this is not enough (genuine multilayer rigid-flex with independent substacks, no-flow prepreg, defined transitions): EasyEDA cannot express it. Escalate to Altium/OrCAD/Xpedition and a rigid-flex fab, or hand-specify the full stackup drawing to the fab as a manual/quoted job.

### EasyEDA -> JLCPCB flex order
One-click order or Export Gerber -> on the order page set material = Flex -> stiffener method is auto-selected from your design attributes (they travel inside the two stiffener layers). This removes the manual "tell the factory where the stiffeners go" step that trips up KiCad/Altium users. Limitations: the one-click flow targets FPC (1-4 layers), not rigid-flex; Physical Stacking is not what gets ordered (re-select on the order page); impedance is never tested on flex regardless of tool.

Doc links: FPC Stiffener https://prodocs.easyeda.com/en/pcb/place-fpc-stiffener/ ; Layer Manager https://prodocs.easyeda.com/en/pcb/tools-layer-manager/ ; Stacked Table https://prodocs.easyeda.com/en/pcb/place-stack-table/ ; JLCPCB EasyEDA flex guide https://jlcpcb.com/help/article/easyeda-flex-pcb-design-user-guide

---

## 9. Tool comparison (how each ECAD tool implements flex)

Two capabilities separate the free/low-cost tools from the professional tier: (1) per-region multi-substack stackup (different layer counts/materials per zone) and (2) bend regions plus 3D fold/unfold. Only the pro tier has both.

| Tool | Flex (pure) | Rigid-flex | How it is implemented | Cost | Best for |
|---|---|---|---|---|---|
| **EasyEDA Pro** | Yes | Emulated (FPC + stiffeners) | FPC board type + FPC Stiffener regions + 3D fold preview + one-click JLC order. No per-region substack/bend lines. | Free | The practical pick for JLCPCB flex |
| **EasyEDA Standard** | No | No | No PCB-type toggle, no stiffener layers | Free | Not for flex |
| **KiCad 7/8/9** | Yes (single flex stackup) | No (workaround only) | One global stackup; rigid/flex regions, bend lines, stiffeners, coverlay drawn on User layers + a fab-notes stackup drawing; parts only on the 2 outer layers | Free/GPL | Pure flex on a budget; documentation-driven simple pseudo-rigid-flex |
| **tscircuit** | No | No | Single global stackup only (`layers`, fr4/fr1); flex is an open feature request (#510) | Free/MIT | Code-defined rigid boards, not flex |
| **Altium Designer** | Yes | Yes (best-in-class) | Layer Stack Manager substacks + Board Planning regions + Bending Lines (radius/angle/fold index) + 3D Fold/Unfold (shortcut 5) | ~$1.5k to $5.5k/yr | Production rigid-flex |
| **Fusion (EAGLE, EOL Jun 2026)** | Workaround | No (native "in progress") | Internal layers as flex + fab notes; no region stackups/bend model | Free personal / paid | EAGLE migrants, not rigid-flex |
| **Cadence OrCAD X / Allegro X** | Yes | Yes (native) | Zone stackups + flex/bend areas + 3D | OrCAD ~$2.5k+/yr, Allegro enterprise | High-end rigid-flex |
| **Siemens Xpedition / PADS Pro** | Yes | Yes (native) | Multiple board outlines, per-outline stackup, 3D (rigid-flex token) | Enterprise | Complex/enterprise rigid-flex |
| **Zuken CR-8000** | Yes | Yes (native) | Multi-stackup + 3D flex manipulation + DFM panelization | Enterprise | Enterprise rigid-flex + MCAD |

### KiCad specifics (the important free case)
- **Pure flex works fine.** From KiCad's view a flex board is just a 1-2 layer board on a different substrate; the Gerbers are identical to rigid. Set the material in Board Setup > Physical Stackup, route, and tell the fab it is polyimide.
- **No native rigid-flex, still true through KiCad 9 (2025).** Single global stackup, parts only on the two outer copper layers, no per-region substack, no bend regions, no 3D fold. KiCad 9 added pad stacks, zone manager, creepage DRC, jobsets, multi-channel, etc., but zero rigid-flex. The rigid-flex stackup-regions feature request (GitLab #3823, filed 2020) remains open/unimplemented and is not on a committed roadmap.
- **KiCad flex/pseudo-rigid-flex workaround:** keep one stackup (flex material, or worst-case layer count); draw the overall outline on Edge.Cuts; draw rigid/flex region boundaries, bend lines, bend radius, coverlay openings, and stiffeners on User/comment layers; provide a separate fabrication drawing / stackup spec telling the fab which layers are polyimide, where the flex sits, bend radii, coverlay, and stiffener locations. The fab builds the true stack from your notes, not from the Gerbers. Curved traces are supported (v6+, RF-Tools plugin helps). Remember to include the stiffener layer when exporting (the popular JLCPCB Fabrication Toolkit plugin does not export a custom stiffener layer by default), and set stiffener options manually in the JLC order form.

### Pragmatic recommendation (free tools, fab at JLCPCB)
- **Pure flex (FPC):** EasyEDA Pro is the pick, purely because JLCPCB built the FPC + stiffener ordering flow into it (removes the stiffener-communication guesswork). KiCad is a fine second choice (1-2 layer PI stackup, coverlay/stiffener on user layers, fab note, standard Gerbers). tscircuit is not an option for flex yet.
- **"Rigid-flex" at JLCPCB:** redesign it as a **flex board + stiffeners** and build it as FPC. That is fully doable in EasyEDA Pro or KiCad and orderable at JLCPCB.
- **True multilayer rigid-flex:** none of the free tools can model it. Step up to Altium/OrCAD/Xpedition and a rigid-flex fab (PCBWay, Sierra/ProtoExpress), see the PCB Vendor Reference List.

See also ECAD Tools & Commands Quick-Reference section 3 (EasyEDA menu paths, JLCPCB one-click order) and section 2 (KiCad).

---

## 10. Practitioner tips and tricks (respin-avoiders)

- **Build a mock-up before finalizing layout:** a paper doll, then a mylar/polyester (0.010 in) mock-up, then a fab mechanical sample. Fit-check it in the real assembly with connectors glued on. If the paper doll tears on install, expect assembly problems. This is the biggest respin-avoider in flex.
- **Get the stackup from your fabricator up front.** Flex fab capability varies widely and is not standardized like rigid, collaborate early.
- **Bake before assembly.** Polyimide is hygroscopic (can approach saturation in under an hour). Bake ~2 to 6 h at ~120 C (225 to 275 F), then assemble immediately or store in a dry box. Skipping this causes popcorn delamination at reflow.
- **Form the flex cold, once, at the end of assembly.** Tight bends permanently stretch the outer copper; re-flexing ripples and embrittles it. Use forming tooling below 10:1 (single/double) or 20:1 (multilayer). Do not heat a formed circuit (the bend relaxes).
- **Vias are tented (coverlay-covered) by default on FPC** to protect the barrel; specify explicitly if you need them open. Never via-in-pad on flex.
- **Impedance calculators are unreliable on thin flex**, validate controlled-impedance flex with a prototype.
- **Avoid large solid exposed copper** (air-trap oxidation, wrinkles, black edges), use hatched copper or add mask windows/coverlay rings.
- **Stiffeners:** FR4 <5 mm wide breaks/carbonizes (use PI or steel); steel not over exposed pads or near Hall sensors; do not place stiffener/adhesive near SMT pads (interferes with stencil printing), add after SMT if needed.
- **Panelize small boards (<20 x 20 mm)** with adequate breakaway tabs (>=2 tabs of ~0.8 mm), keep tabs off the gold-finger edge.
- **Thermal-relief pads** on any pad in large copper (large copper sinks heat, makes soldering hard).
- **Use a carrier/transport tray during assembly** (flex is far more damage-prone than rigid) and match the reflow profile to the thinner, lower-mass materials (do not reuse a standard rigid profile).

---

## 11. Workflow integration notes

- **Plan first:** validate the architecture (interfaces, connectivity, part compatibility) before ECAD. Flex is additionally a mechanical/DFM concern that lives in ECAD + the fab conversation, downstream of the logical design.
- **ECAD:** for a flex/FPC board, EasyEDA Pro is the pragmatic choice for JLCPCB (one-click FPC + stiffener). KiCad works for pure flex, with the user-layer + fab-notes workaround. tscircuit does not do flex.
- **Fab:** default flex prototype at JLCPCB (FPC, 1-4 layers, stiffeners for rigid zones). Escalate genuine rigid-flex to PCBWay or a US rigid-flex house (Vendor Reference List) with a pro tool.
- **Review:** run the section 3 bend-zone checklist and the section 7 JLCPCB DFM gotchas in addition to the general PCB Design SOP review checklist. EasyEDA/KiCad DRC will NOT flag flex-specific issues (bend radius, copper in bends, hatched planes, via-in-pad on flex), those are manual.

---

## Sources

Fundamentals / best practices / IPC:
- Flexible Circuit Technologies design guide (terms, Types 1-5, classes, cost, materials, unbonded construction, forming, I-beam, anchoring spurs, EMI/silver ink): https://www.flexiblecircuit.com/wp-content/uploads/2025/07/FCT_Design-Guide-0725_FINAL.pdf
- Sierra Circuits / ProtoExpress flex design guidelines (bend radius by layer, via/PTH clearances, hatch, stiffener overlap, stackup, bookbinding): https://www.protoexpress.com/blog/flex-pcb-design-guidelines-for-manufacturing/
- Epec flex/rigid-flex bend capabilities (bend regimes, air-gap vs bonded): https://blog.epectec.com/flex-rigid-flex-bend-capabilities ; IPC-6013 overview: https://blog.epectec.com/ipc-6013-specification-for-flexible-pcbs-things-to-know
- Multi-CB flex and rigid-flex (bend-ratio tables, coverlay vs solder-stop, stiffener thicknesses, raster planes): https://www.multi-circuit-boards.eu/en/pcb-design-aid/circuit-board-types/flex-and-rigid-flex-boards.html
- Siemens / Stephen Chavez, "Mastering the Bend" (staggered traces, hatched planes, impedance strip): https://blogs.sw.siemens.com/electronic-systems-design/2025/10/15/mastering-the-bend-essential-tips-tricks-for-rigid-flex-pcb-design/
- Aivon ultimate rigid-flex guide (transition/bikini cut, no-flow prepreg, plasma etch, CTE/via, cost breakdown): https://www.aivon.com/blog/pcb-design/the-ultimate-guide-to-rigid-flex-pcb-design-mastering-reliability-complexity-and-cost/
- PCBWay bend-area guidelines: https://www.pcbway.com/blog/PCB_Design_Layout/Flex_PCB_Bending_Area_Design_Guidelines_How_to_Prevent_Trace_Cracking_and_Failu_c5658260.html ; flex cost drivers: https://www.pcbway.com/blog/PCB_Manufacturing_Information/What_Determines_Flexible_PCB_Cost_Key_Factors_Explained_71bc81c2.html
- Saturn Flex IPC standards map: https://www.saturnflex.com/technology_hub/ipc_standards.php
- Flex Plus, rigid-flex vs semi-flex: https://www.flexplusfpc.com/post/rigid-flex-pcb-vs-semi-flex-pcb ; GC Aero sculptured flex: https://gcaflex.com/sculptured-flex/

JLCPCB:
- Flex PCB capabilities (primary spec table, "rigid-flex not yet supported"): https://jlcpcb.com/capabilities/flex-pcb-capabilities
- Flexible PCB resources: https://jlcpcb.com/resources/flexible-pcb ; Flex offer (pricing, MOQ, stiffeners): https://jlcpcb.com/RGE/FlexPCB
- EasyEDA Flex PCB Design User Guide: https://jlcpcb.com/help/article/easyeda-flex-pcb-design-user-guide
- FPC impedance guide (no testing, +/-20%): https://jlcpcb.com/help/article/fpc-impedance-trace-width-spacing
- Essential flex design guidelines: https://jlcpcb.com/blog/essential-flex-pcb-design-guidelines ; 45 flex tips: https://jlcpcb.com/blog/must-know-flex-pcb-tips-45 ; bend radius: https://jlcpcb.com/blog/flexible-pcb-bend-radius ; flex panels: https://jlcpcb.com/blog/design-guidelines-flex-pcb-panels

EasyEDA:
- FPC Stiffener: https://prodocs.easyeda.com/en/pcb/place-fpc-stiffener/ ; Layer Manager (PCB Type + Physical Stacking): https://prodocs.easyeda.com/en/pcb/tools-layer-manager/ ; Stacked Table: https://prodocs.easyeda.com/en/pcb/place-stack-table/ ; Standard Layer Manager (no FPC): https://docs.easyeda.com/en/PCB/Layer-Manager/
- EasyEDA official YouTube: "4.4 FPC Design" https://www.youtube.com/watch?v=JeOtDUNiIjA ; "Quick Tips PCB 86: Add a Stiffener to FPC" https://www.youtube.com/watch?v=04OzQZgdn8Y
- Specifying stiffeners for JLC flex (KiCad vs EasyEDA contrast): https://electronics.stackexchange.com/questions/691350/how-to-specify-the-stiffener-for-ordering-flex-pcbs-at-jlcpcb

Other tools:
- KiCad flex support thread: https://forum.kicad.info/t/when-will-the-flex-pcb-be-supported-in-kicad/32597 ; rigid-flex feature request GitLab #3823: https://gitlab.com/kicad/code/kicad/-/issues/3823 ; KiCad 9.0.0 notes: https://www.kicad.org/blog/2025/02/Version-9.0.0-Released/ ; rigid-flex workaround (Reddit): https://www.reddit.com/r/KiCad/comments/n5gc12/rigid_flex_design/
- tscircuit board element (single stackup; flex = issue #510): https://docs.tscircuit.com/elements/board ; https://github.com/tscircuit/tscircuit/issues/510
- Altium rigid-flex (substacks, board regions, bending lines, 3D fold): https://www.altium.com/documentation/altium-designer/pcb/rigid-flex-design/advanced
- Autodesk Fusion rigid-flex thread (no native support): https://forums.autodesk.com/t5/fusion-electronics-forum/rigid-flex-support/td-p/12785399 ; EAGLE EOL: https://www.autodesk.com/products/fusion-360/blog/future-of-autodesk-eagle-fusion-360-electronics/
- Cadence OrCAD X rigid-flex: https://resources.pcb.cadence.com/rigid-flex-design/orcad-x-how-to-rigid-flex ; Siemens Xpedition rigid-flex: https://www.siemens.com/en-us/products/pcb/engineering-productivity-and-efficiency/advanced-design/rigid-flex-pcb-design/ ; Zuken CR-8000: https://www.zuken.com/en/product/cr-8000/cr-8000-release-2020-whats-new/
