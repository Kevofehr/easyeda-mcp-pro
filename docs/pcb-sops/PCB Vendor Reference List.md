# PCB Fabrication & Assembly Vendor Reference

Vendor directory companion to the PCB Manufacturing & Assembly SOP. Use this to pick where to get a quote. Ordered roughly from "easiest / go-to" down to "alternates," split US vs overseas.

Last researched: 2026-06-20. All capabilities verified against each vendor's own website where possible; uncertain items are flagged. Prices are vendor "from / starting" figures and move with spec and quantity, so always run a live quote.

A note on tariffs: China-origin boards (JLCPCB, PCBWay, etc.) carry US import duties that change frequently. Check landed cost, not just the quoted board price, when comparing China vs domestic.

---

## 1. Quick decision guide

| If you need...                                              | Go to                                  |
|-------------------------------------------------------------|----------------------------------------|
| Cheapest fast prototype, simple 1-6 layer board             | **JLCPCB**                             |
| Cheap proto + turnkey assembly from China                   | **JLCPCB** (parts), **PCBWay** (advanced) |
| HDI / blind-buried vias / rigid-flex / exotic, still cheap  | **PCBWay**                             |
| A few high-quality US-made bare protos (small boards)        | **OSH Park**                          |
| Flat fixed-price US proto specials                          | **Advanced Circuits / AdvancedPCB**    |
| Premium certified US boards (aero/medical/defense, hi-speed) | **Sierra Circuits**                   |
| US (CA) quick-turn fab with instant DFM tool                | **Bay Area Circuits**                  |
| Fast US-made *turnkey assembly*, no MOQ, instant quote       | **MacroFab** or **CircuitHub**        |
| Quick-turn US assembly of one or a few boards               | **Screaming Circuits**                 |
| Fast US-made rigid-flex proto                               | **Royal Circuits**                     |
| EU-made boards, full in-house fab-to-assembly + DFM          | **Eurocircuits**                      |
| Cheap fast EU proto + small assembly (free worldwide ship)   | **Aisler**                            |
| German-made quick-turn incl. HDI/flex (no assembly)          | **Würth / WEdirekt**                   |
| Free SMD stencil bundled with an EU proto                    | **Beta LAYOUT / PCB-POOL**             |
| Unusual / mil-spec board no normal shop will build           | **San Francisco Circuits** (broker)    |
| Leading-edge US-made uHDI / defense substrates               | **TTM (Syracuse)**, **Calumet**        |

Sensible default workflow: prototype on **JLCPCB** (cheapest/fastest) unless the design needs HDI/rigid-flex (→ **PCBWay**) or must be US-made / ITAR (→ **MacroFab**, **CircuitHub**, **Advanced Circuits**, **Sierra**).

---

## 2. Tier 1 — Go-to (China, cheapest, fast, full turnkey)

Both are China-based, in-house manufacturers (NOT brokers). Both ship worldwide with instant online quoting.

### JLCPCB — jlcpcb.com
- **Made in:** China, in-house fully-automated factory (Grade-A laminates: Nan Ya, KB, Shengyi). Not a broker.
- **Does:** Bare fab + assembly (SMT/THT/mixed) + full turnkey + SMT stencils + in-house parts library + PCB layout service.
- **Sweet spot / MOQ:** Prototype to low/mid volume. Bare-board effectively 5 pcs; **assembly from just 2 boards**.
- **Capabilities:** 1-32 layers; controlled impedance (4-32L, +/-10%, online calculator); min trace/space 3.5/3.5 mil multilayer (4/4 mil on 1-2L); min via 0.15 mm hole. **No blind/buried vias (through-holes only) — key limitation.** Flex, aluminum-core, copper-core, Rogers/PTFE RF (2L). Assembly down to 01005, BGA/QFN, 0.35 mm fine pitch, X-ray/AOI/SPI/flying-probe, conformal coating, IC programming. Quick-turn as fast as 24 h assembly; ~90% of PCBA done within 24 h.
- **Price:** Budget — the cost leader. PCBA stated $8 setup + $0.0016/joint; monthly SMT coupons can waive setup. 680k+ in-stock parts, no parts markup.
- **Order:** Instant online quote, upload Gerbers (+ BOM & pick-and-place for assembly). https://cart.jlcpcb.com/quote
- **Use them when...** you want the cheapest, fastest prototype-to-low-volume turnkey boards and don't need blind/buried vias. The default budget go-to.

### PCBWay — pcbway.com
- **Made in:** China (Shenzhen / Hangzhou), in-house — 3 PCB fabs + 2 PCBA facilities. Site states "Not A Broker." ISO 9001.
- **Does:** Bare fab (standard + advanced) + assembly (turnkey/kitted/partial) + stencils, plus broader CM: CNC (3/4/5-axis), 3D printing, sheet metal, cable/harness, box build.
- **Sweet spot / MOQ:** Prototype through production and high-spec advanced boards. Bare 5 pcs; assembly as low as 5 pcs; quoted 1-10,000+.
- **Capabilities:** 1-14 layers standard, up to 64 advertised on advanced tier; controlled impedance +/-10%; min trace/space 4 mil standard, down to 2 mil advanced. **Blind & buried vias + any-layer/stacked HDI: YES** (its main edge over JLCPCB). **Flex and rigid-flex: first-class.** FR-4, aluminum, copper-base, high-Tg, Rogers, PTFE, mixed stackups; copper 0.5-13 oz. Many finishes (HASL, ENIG, OSP, hard gold, imm. silver/tin, ENEPIG). Assembly to 01005, BGA 0.3 mm pitch, X-ray/AOI/ICT/functional test, reballing. Quick-turn 24 h fab.
- **Price:** Mid (still cheap by Western standards). Bare from $5/10 pcs, assembly from $29, flex ~$46, HDI ~$350. No parts markup.
- **Order:** Instant online quote: PCB https://www.pcbway.com/orderonline.aspx | Assembly https://www.pcbway.com/quotesmt.aspx. Sales reps for out-of-spec jobs.
- **Use them when...** the design outgrows JLCPCB's standard process — HDI, blind/buried vias, rigid-flex, exotic materials, high layer count — or you want PCB + mechanical parts from one vendor.

| | JLCPCB | PCBWay |
|---|---|---|
| Max layers | 32 | 14 std / up to 64 adv |
| Blind/buried vias, HDI | No | Yes |
| Flex / rigid-flex | Flex yes; rigid-flex limited | Both, first-class |
| Min trace/space | 3.5 mil (multilayer) | 4 mil std / 2 mil adv |
| Assembly MOQ | 2 pcs | 5 pcs |
| Price tier | Budget (cheapest) | Mid |
| Beyond PCB | Parts, layout | + CNC, 3D print, sheet metal, box build |

---

## 3. Tier 2 — US-based

Flag: several "US" PCB brands are brokers that outsource fab overseas. The genuinely US-in-house anchors here are OSH Park, Sierra, Bay Area Circuits, Royal, Sunstone, and (for assembly) Screaming Circuits / MacroFab / CircuitHub. Brokers/hybrids are called out.

### Advanced Circuits / AdvancedPCB — advancedpcb.com (formerly 4pcb.com)
- **Made in:** US, in-house ("Made in America," ITAR). Note: 4pcb.com now redirects to advancedpcb.com, which is the 2024 merger of APCT + Advanced Circuits Inc. + San Diego PCB — six US fabs (Aurora CO HQ, Santa Clara CA, Chandler AZ, Anaheim/Orange CA, Maple Grove MN, Placentia CA). It ALSO runs a "Global Solutions" offshore-broker track (China/Japan/Taiwan/Thailand/SE Asia) for high-volume programs — **confirm at quote whether your order is built domestically or routed offshore.**
- **Does:** Bare fab + assembly (turnkey/kitted/partial) + DFM + design services + free DFM file check + PCB Artist design software.
- **Sweet spot:** Quick-turn proto through volume; no assembly minimum. Famous fixed-price proto specials.
- **Capabilities:** 0-40 layers (advanced; std 0-10L); HDI/UHDI; flex 1-6L, rigid-flex 4-22L; RF/microwave; aluminum-clad; impedance control; same-day to 4-week turns ("Weekend Wonders"). IPC Class 3, AS9100, ITAR.
- **Price:** Mid, with well-known cheap flat-rate protos ($33 ea 2-layer, $66 ea 4-layer, "Bare Bones," $99 RF/aluminum specials).
- **Order:** Instant online quote + free DFM: https://www.my4pcb.com/Net35/Login.aspx ; phone 1-800-979-4722.
- **Use them when...** you want a proven US house for cheap fixed-price protos or fast US-made boards, with a path to scale to volume (incl. managed offshore).

### OSH Park — oshpark.com
- **Made in:** US (partner US fabs), ships worldwide.
- **Does:** Bare fab only (no assembly). Open-hardware community focus. Signature purple soldermask + ENIG, lead-free.
- **Sweet spot / MOQ:** Prototype/hobby/light production. Shared-panel; sold in **sets of 3 copies**, priced per square inch.
- **Capabilities:** 2L (1.6 mm), 4L, 6L, "After Dark" (black/clear), 2 oz heavy copper, Flex (2L, sometimes unavailable), Bulk Order (40% volume discount). "Super Swift" 4-5 business days; standard 9-21 days. No HDI/blind-buried/rigid-flex/exotic — modest spec ceiling.
- **Price:** Budget for small boards ($5/sq-in 2L, $10 4L, $15 6L for 3 copies). Less economical as area grows.
- **Order:** Self-service web upload (KiCad, EagleCAD, or zipped Gerbers), instant. https://oshpark.com/
- **Use them when...** you need a few high-quality US-made prototype boards cheaply (especially small 2/4-layer), no assembly, and the purple/ENIG default is fine.

### Sierra Circuits — protoexpress.com
- **Made in:** US, in-house — "100% Made in USA: From Fab to Assembly," Sunnyvale CA since 1986. ITAR, AS9100D, ISO 13485, MIL-PRF-31032/55110, IPC Class 3. One of the cleanest "genuinely US-made" options.
- **Does:** Bare fab + full turnkey ("Turnkey PRO") + assembly + advanced/HDI/flex. Strong free designer tools (impedance, stackup, trace calculators).
- **Sweet spot:** Prototype through advanced low/mid production; premium quick-turn; "Zero Defects Guaranteed."
- **Capabilities:** Up to 30 layers (advanced; std online to 12L, turnkey 2-8L). Min trace/space 4 mil turnkey / **2 mil standard online** / 1.5 mil advanced. Rigid, flex, rigid-flex, HDI, blind/buried/microvias, exotics (Rogers, polyimide, aluminum-clad, metal core, high-temp). Copper to 6 oz. As fast as 24 h fab / 5-day full turnkey.
- **Price:** Premium — one of the pricier US houses, justified by quality/certs/speed/design support.
- **Order:** Instant online quote (Standard + Turnkey PRO) or custom for advanced. https://www.protoexpress.com/customer-portal/instant-online-quote ; phone 1-800-763-7503.
- **Use them when...** you need high-reliability certified US boards (aerospace/medical/defense/high-speed), fast turn, or full turnkey with strong DFM hand-holding, and budget allows premium.

### Bay Area Circuits — bayareacircuits.com
- **Made in:** US, in-house fab (30,000 sq-ft, Fremont CA, since 1975). Note: assembly is handled in-house *and* via integrated EMS partners — fab is domestic, some assembly may be partner-fulfilled.
- **Does:** Bare fab (core strength) + design/layout + assembly (turnkey/quick-turn via EMS partners).
- **Sweet spot:** Quick-turn proto and short/medium runs (24 h+). ITAR, ISO, RoHS, IPC Class 2 (Class 3 advanced).
- **Capabilities:** Std to 16 layers, advanced to 30L; trace/space 4 mil std / 2 mil advanced; controlled impedance +/-10% (+/-5% adv) with TDR; blind/buried vias, HDI (4+N+4 or any-layer), microvias (laser to 3 mil), heavy copper to 5 oz, edge castellations; FR-4, Isola, Rogers, PTFE/Duroid, polyimide, flex. Free DFM + panelizer.
- **Price:** Mid — competitive quick-turn US fab.
- **Order:** "InstantDFM" web tool gives quick-turn price + DFM report in minutes. https://instantdfm.bayareacircuits.com/
- **Use them when...** you want a California fab for quick-turn protos/short runs with a solid instant-DFM tool and good advanced ceiling, without Sierra-premium pricing.

### MacroFab — macrofab.com
- **Made in:** North America via an audited partner-factory network (HQ Houston TX; partners across North America incl. Mexico for lower-cost assembly). Not a single in-house fab, but **the only ITAR-registered self-service PCBA platform** and explicitly positioned against offshore/China risk. US human account managers.
- **Does:** Turnkey PCB **assembly**-centric (core); manages fab + sourcing + assembly via one platform ("FabIQ" quoting). Inventory/consignment mgmt, revision control, supply-chain/tariff visibility.
- **Sweet spot:** Prototype through production, no contracts/minimums; strong for scaling the same design 10 to 10k.
- **Capabilities:** Fab 2-36 layers, HDI, blind/buried/micro/back-drilled vias, impedance, castellations; assembly to 01005, fine-pitch BGA/QFN (0.3 mm lead / 0.4 mm ball), THT/SMD/hybrid, conformal coat, potting; min trace/space/annular 3 mil; FR4, Rogers 4003C/4350B/4450B, aluminum; max board 14.9 x 14.9 in. IPC-A-610 Class 2 (Class 3 avail), J-STD-001, ISO 9001, ITAR, UL.
- **Price:** Mid — transparent itemized instant pricing; cheaper than premium US fabs, pricier than pure China turnkey but with US support/IP/ITAR.
- **Order:** Self-service instant quote, upload BOM + files, itemized quote in <15 min, no contracts. https://factory.macrofab.com/quick_quote
- **Use them when...** you want turnkey assembly built in North America with instant quoting, BOM/inventory management, ITAR, and a clean prototype-to-production path. Strong fit for robotics/hardware builds.

### Royal Circuit Solutions — royalcircuits.com
- **Made in:** US, in-house (Hollister CA HQ + Santa Ana CA). "Wholly USA owned" quick-turn fab. Acquired by **Summit Interconnect (2022)**; still operating under the Royal brand.
- **Does:** Bare-board fab (rigid, flex, rigid-flex, ATE/test boards) + quick-turn prototype SMT assembly. Free impedance calculator + design review.
- **Sweet spot:** Prototype and medium runs; quick-turn is the identity. Low/no MOQ.
- **Capabilities:** Up to ~20 layers; 3/3 mil trace/space; rigid-flex and flex; via-in-pad; heavy copper; controlled impedance; exotic laminates. **Same-day** rigid protos; flex/rigid-flex in **under 4 days**.
- **Price:** Premium (US quick-turn).
- **Order:** Online quote/upload at https://www.royalcircuits.com/ ; sales contact available.
- **Use them when...** you need a fast US-made prototype or quick-turn rigid-flex (next-day to a few days) and care about domestic sourcing over lowest unit cost.

### Screaming Circuits — screamingcircuits.com (Milwaukee Electronics / Sunstone brand)
- **Made in:** US, in-house assembly (Milwaukee Electronics EMS heritage). Partners with ASC/Sunstone for bare boards, giving a proto-to-production path.
- **Does:** PCB **assembly** (proto + small/mid volume) + component sourcing + turnkey (fab + assemble). Strong on partial-turnkey and consigned kits.
- **Sweet spot / MOQ:** Quick-turn proto and low/mid assembly; **no/low MOQ** — built around single-prototype and small-batch.
- **Capabilities:** Fine-pitch, BGA/uBGA, QFN, mixed SMT + THT; quick-turn (~1 day assembly on standard service). Instant quoting for standard builds; "Upload & Go" complex jobs get a formal quote within 3 business days.
- **Price:** Mid to premium (US quick-turn proto assembly).
- **Order:** Instant online quote for standard; "Upload & Go" for complex. https://www.screamingcircuits.com/
- **Use them when...** you need fast US assembly of one or a handful of prototype boards (you supply or they source parts), especially early-stage builds where MOQ-free turnkey matters.

### Sunstone Circuits — sunstone.com
- **Made in:** US bare-board heritage (Mulino OR); recently **merged with American Standard Circuits (ASC)** (US fab, IL). Still operating (© 2026). Confirm specific facility per order post-merger.
- **Does:** Bare PCB fab in tiers — ValueProto (budget proto), PCBExpress (quick-turn), PCBPro (full-feature production) — plus assembly, stencils, and PCB123 design software with built-in DFM.
- **Sweet spot / MOQ:** Prototype through production; great for self-service protos. Low MOQ.
- **Capabilities:** 1-14 layers, standard + flex; build times same-day through 3-week; controlled impedance + DFM analysis.
- **Price:** Budget-to-mid (ValueProto is a notably low-cost US tier).
- **Order:** Instant online quote https://onequote.sunstone.com/ ; PCB123 can push orders directly. https://www.sunstone.com/
- **Use them when...** you want an inexpensive US-made bare prototype with tiered speed options (incl. same-day) and self-service quoting, scalable via the ASC tie-up.

### Imagineering Inc — pcbnet.com
- **Made in:** **US-based broker/hybrid — flag.** Branded "USA PCB manufacturer," but bare-board fab is offshore (**Korea and Taiwan**). US side = engineering, DFM (Elk Grove Village IL) and assembly; HQ Southlake TX. So: US-managed + US assembly, offshore fab.
- **Does:** Bare-board fab (mostly offshore-built) + PCB assembly (consignment + turnkey) + full turnkey. AS9100D, ISO 9001.
- **Sweet spot:** Prototype through volume; low-cost via offshore fab + US program mgmt. MOQ effectively low for protos.
- **Capabilities:** Up to 30 layers; copper to 6 oz; blind/buried vias; HDI; impedance; FR4, Rogers, aluminum, polyimide. Standard 5-7 day production; quick-turn protos available.
- **Price:** Budget/mid (offshore fab + US overhead).
- **Order:** Quick-quote https://www.pcbnet.com/quote/ ; (847) 806-0003.
- **Use them when...** you want a US single point of contact + US assembly but lower offshore fab pricing, and you're OK that bare boards are built in Korea/Taiwan (not made-in-USA).

### San Francisco Circuits — sfcircuits.com
- **Made in:** **Broker / network — flag.** Founded 2005, sales/engineering offices in San Mateo + San Diego CA, no own fab. Fulfills via a worldwide partner network ("Borderless Boards") — boards may be domestic or offshore depending on partner. ITAR-compliant, CMMC L2, ISO 9001. Confirm build country per order.
- **Does:** Single-source brokerage of bare fab + assembly (turnkey, quick-turn), incl. hard-to-build/advanced boards others decline.
- **Sweet spot:** Prototype through production, emphasis on complex/advanced and mil-spec that need a sourcing partner.
- **Capabilities (via network):** Rigid-flex, flex, metal-core, RF/microwave, mil-spec IPC Class 1/2/3, 40+ layers, 3 mil trace/space, blind/buried/via-in-pad/filled vias, heavy copper, BGA, many materials.
- **Price:** Mid-to-premium (depends on partner routing + brokerage markup).
- **Order:** **Not a true instant quote** — email/contact. https://www.sfcircuits.com/get-a-pcb-quote ; 1-800-SFC-5143.
- **Use them when...** you have an unusual/complex/mil-spec board normal houses won't make and want one broker to source it — but verify manufacturing country and expect a sales-driven quote.

### CircuitHub — circuithub.com
- **Made in:** **US, in-house** — automated factory ("the Grid") in Massachusetts (South Deerfield). Explicitly "Made in the USA." Not just an aggregator: proprietary automation + computer vision + AI ("software-defined manufacturing"); publishes real-time quality/lead-time KPIs. Raised $28M (led by Plural, May 2026) to scale capacity.
- **Does:** **Full turnkey** on-demand fab + assembly (board + parts + assembly). Shared inventory of 35k+ common parts; will stock custom parts. Native CAD (Altium, EAGLE, KiCad). Assembly-centric — not a standalone bare-fab/stencil vendor.
- **Sweet spot / MOQ:** Prototype and low/small-batch production; targets robotics/hardware startups. No/low MOQ ("even just one board"); scales to thousands. Customers incl. Blue Robotics, Formlabs, Barrett Technology.
- **Capabilities:** Instant online quoting (~5 min), virtual build/board viewer, real-time public quality metrics, factory chat. ~81% of full-turnkey orders ship within 3 days.
- **Price:** Mid (premium vs China, but automation claims low-volume pricing well below traditional US CMs).
- **Order:** Instant quote / signup https://app.circuithub.com/signup ; drag-drop PCB files. https://www.circuithub.com
- **Use them when...** you're a robotics/hardware startup wanting fast (~3-day) US-made turnkey protos and small batches, no MOQ, instant quotes, transparent lead-time/quality data.

> **Defunct — do not use:** **Tempo Automation** (tempoautomation.com) filed Chapter 7 liquidation (Delaware, Dec 8 2023); operations ceased, equity wiped out. No revival found. Remove from any active list.

---

## 4. Tier 3 — Overseas / EU / prototype-friendly

### EU

**Eurocircuits — eurocircuits.com.** In-house EU fabs in **Hungary + Germany** (pooling done in their own plants, not brokered to Asia). Bare fab + PCBA + turnkey (400k+ component DB, stocked passives) + laser-cut stencils. Specialist in low volume. Up to 16 layers; HDI pool (100 um microvias, 6/8L); defined-impedance pool (4/6/8L); RF pool (Isola I-TERA, Rogers 4000); IMS/aluminum; semi-flex (full flex/rigid-flex unconfirmed); min track/gap 100 um pooled (90 um non-pooled); BGA to 0.4 mm. Quick-turn from 1 working day; standard pool 5 WD bare / 10 WD assembled. Mid-to-premium. Instant calculator + DRC/DFM Visualizer: https://be.eurocircuits.com/shop/assembly/configurator.aspx. **Use when** you need EU-made, fully in-house fab-through-assembly with strong DFM verification and advanced options, valuing supply-chain transparency over rock-bottom price.

**Aisler — aisler.net.** Netherlands-HQ (Aisler B.V.); boards "100% Made in Europe / Germany" (fab ownership vs partner: unknown). Bare fab + prototype PCBA + component supply + larger-batch/box-build. Maker/startup-friendly, no stated MOQ. Up to 8 layers; HASL-LF & ENIG; 35/70 um copper; 0.8/1.6 mm; FR4 TG140-150. HDI/impedance/flex/min-trace: not in standard portfolio (unknown). Boards in as little as 1 business day; assembly within 6 BD; free worldwide shipping. Budget — boards from $13.99 (1-day), $10 first-order discount. Instant calculator, native-CAD upload: https://aisler.net/p/new. **Use when** you want cheap, fast (1-2 day) EU-made protos + small assembly with free worldwide shipping; not for HDI/flex/impedance.

**Würth Elektronik / WEdirekt — wedirekt.com.** In-house, **Germany** (quick-turn online arm of Würth Elektronik CBT). Bare fab + SMD stencils only — **no PCBA on this portal.** Delivery from 1 piece, no tooling cost. Up to 16 layers; HDI (1-xb-1, 1-x-1); RIGID.flex (2-6L) and PURE.flex (1-2L); min structures 85 um; min drill 0.10 mm; ENIG/HAL-LF/imm. tin. Controlled impedance: unknown. Express from 72 h; standard from 5 WD. Mid/premium. Instant calculator: https://www.wedirekt.com/en-de/configurator. **Use when** you need German-made, traceable quick-turn protos/small series incl. HDI/flex/rigid-flex up to 16L with 72 h express, and don't need assembly from the same portal.

**Beta LAYOUT / PCB-POOL — beta-layout.com / pcb-pool.com.** In-house, **Germany** (Beta BOARD GmbH, two Aarbergen-Kettenbach plants). Separate PCB-OVERSEAS track for brokered series (from 10 WD) — EU protos in-house, overseas series brokered. Bare fab (pooled protos) + PCBA (SMT+THT, BGA, turnkey) + **free SMD stencil with every PCB-POOL order** + SLS 3D printing + front panels. MOQ effectively 1. 1/2/4/6/8/10 layers; rigid, flex, aluminum-core. HDI/rigid-flex/impedance/min-trace: unknown (design-rule pages JS-rendered). PCBs from 8 hours; assembly from 2 WD. Mid. Instant configurator: https://us.beta-layout.com/pcb/configuration/. **Use when** you want a fast EU/German proto (as quick as 8 h) bundled with a free SMD stencil + optional in-house turnkey assembly from a single piece.

**Multi-CB / Multi Circuit Boards — multi-circuit-boards.eu.** Group HQ in UK; logistics/warehouse in Brunnthal near Munich (no EU customs delays). Presents as a manufacturer running a pooling model — **physical fab country not stated (flag if origin matters).** Bare fab (rigid, flex, rigid-flex, IMS, HF/Rogers, high-Tg, thick-copper) + SMD stencils. **No PCBA.** No minimum, from 1 piece. 1-48 layers (1-10 online, 12-48 by quote); min trace/space 0.1 mm (~4 mil), 0.2 mm drill; blind/buried vias; impedance; thick copper to 560 um; Rogers 4350B; IPC Class 2 std (3 avail); UL. Express from 1 WD, standard from 4 WD. Mid ("Hightech at Lowcost") — e.g. 80x100 mm 1 pc: 2L EUR14.80 (8WD), 4L EUR25.80+, 8L EUR149+. Instant calculator w/ live DRC, imports Gerber/ODB++/EAGLE/KiCad/Target: https://portal.multi-circuit-boards.eu/?Sprache=en. **Use when** you're EU-based and want fast, low-cost proto-to-small-series bare boards (incl. flex/rigid-flex/HF, up to 48L) with no customs delay and built-in DRC — and you'll assemble elsewhere.

### Asia (China)

**Seeed Studio Fusion — seeedstudio.com/fusion.html.** China (Shenzhen), in-house Seeed arm. Full turnkey — fab + PCBA + stencils + free DFA + 3D print/CNC + kitting (from 5 sets), backed by Open Parts Library (1M+ stocked parts). Min trace/space 4/4 mil; 24-hour build; Quickturn/Premium/Advanced tiers. Max layers/HDI/flex/impedance: not on landing pages (unknown — confirm in calculator). Budget-to-mid. Instant quote https://www.seeedstudio.com/fusion_pcb.html. **Use when** you want a single Shenzhen partner from prototype PCBA through mass production + kitting, leveraging OPL stocked parts.

**Elecrow — elecrow.com.** China (Shenzhen), since 2012 (in-house vs outsourced fab: unknown). Fab + PCBA + stencils + 3D print/CNC/laser/molding/box-build + own product lines. PCB MOQ 5 pcs; PCBA MOQ 1 pc (instant checkout <=20 units). 1/2/4/6/8 layers; FR-4, aluminum, copper-core, flex (FPC), Rogers; HASL/LF-HASL/ENIG/OSP; castellated; up to 2 oz outer. Production 3-5 WD; PCBA ~3 weeks. HDI/>8L/impedance/min-trace: unknown. Budget — 2L 100x100 mm 5 boards = $4.90; PCBA from $30. Instant calculators https://www.elecrow.com/pcb-manufacturing.html. **Use when** you want the cheapest fast-turn protos (<=8L) plus optional one-stop maker services, and your design fits standard 1-8L specs.

**NextPCB — nextpcb.com.** China (Shenzhen), in-house (2 PCB fabs + 2 assembly factories, ~20,000 m², 36 SMT lines). Part of HQ group (HQ Online parts, HQDFM DFM). **No US entity — treat as overseas for any made-in-USA requirement.** Full turnkey — fab + PCBA + stencils + BOM sourcing (600k+ in-stock) + free HQDFM tool + Gerber viewer. Zero MOQ; protos from 5 pcs. Up to 32 layers (layout service to 42L); HDI 3 (any-layer 3rd order); flex to 6L; rigid-flex; heavy copper to 10 oz; aluminum/copper-core/ceramic/Rogers/high-Tg; impedance; IPC Class 3; assembly to 01005, 0.25 mm BGA/QFN. ISO 9001, IATF16949, ISO 13485. Min trace/space: unknown. Lead time from 24 h (1-2L). Budget-to-mid — $5 for 1-2L proto; PCBA promo free assembly for 10 / 50% off 100. Instant calculators https://www.nextpcb.com/pcb-quote, /advanced-pcb-quote, /pcb-assembly-quote. **Use when** you want one Chinese partner for fab + turnkey assembly + parts + free DFM tooling, zero MOQ, from 24 h proto up to IATF/ISO 13485 production.

**ALLPCB — allpcb.com.** China, founded 2015. Describes itself as an "Electronic Collaborative Manufacturing Service / collaborative giga-factory" — implies a networked/aggregator model, so **"100% in-house" is uncertain.** Quick-turn fab + PCBA + stencils + flex/rigid-flex/aluminum, plus added CNC/3D print/sheet metal. Strongly prototype/quick-turn ("World's Fastest"). 1-32 layers; max 630x520 mm; Cu 1-6 oz; min trace/space 0.076 mm (3/3 mil at 1 oz); min via 0.15 mm inner; ENIG/ENEPIG/imm. Ag/Sn; FR-4/Rogers/aluminum/copper; castellated, gold-finger bevel, V-cut. Impedance/HDI max: unknown. Fab from 24 h (FR-4/aluminum); flex/rigid-flex from 3d; Rogers 5d; HDI 10d. Budget (per 5 pcs): FR-4 & aluminum from $5; flex/rigid-flex $69; Rogers $196; HDI $265. Instant calculators https://www.allpcb.com/online_pcb_quote.html. **Use when** speed is the priority for a simple-to-moderate proto and you don't need a single-owned-fab guarantee.

**Gold Phoenix PCB — goldphoenixpcb.com.** China (Wuhan, Hubei), markets to North America via a Canada sales office; factory-direct, ships from China. Bare fab (rigid, flex, rigid-flex, metal-core) + PCBA + stencils (laser + plastic) + CNC + OEM. Prototype through low/medium volume; "PCB POOL" panel-shared service (min ~10 in^2). Heavy copper (4 oz), via-in-pad/epoxy-filled vias, 4-mil traces, 0.4 mm CSP. Budget — rigid pool $0.5/in^2 (2L); 2L 50 in^2 $39.99; flex from $1.2/in^2; assembly from $120/1,000 pins; stencils from $40. Online Quick Quote (goldphoenixpcb.com/quickquote.php) or pool ordering; sales@goldphoenixpcb.com. **Use when** you want China-tier pricing on flex/heavy-copper/low-volume protos from a long-standing shop and don't need a US supply chain.

#### Overseas quick reference
- **Genuine in-house EU fabs:** Eurocircuits (HU+DE), Würth/WEdirekt (DE), Beta LAYOUT (DE). Aisler EU-made (fab ownership unconfirmed). Multi-CB = UK-HQ manufacturer/pooler, physical fab country unconfirmed.
- **Bare fab + stencils only (no PCBA):** Würth/WEdirekt, Multi-CB.
- **Fastest quick-turn:** Beta LAYOUT 8 h (fab) > NextPCB/ALLPCB/Seeed 24 h > Würth 72 h express > Eurocircuits/Multi-CB/Aisler ~1 WD.
- **Cheapest protos:** Elecrow ($4.90/5), ALLPCB & NextPCB ($5), Aisler ($13.99). EU in-house sit mid-to-premium.
- **Most advanced (verified on-site):** NextPCB (32L, HDI-3, rigid-flex, ISO 13485), Multi-CB (48L, flex/rigid-flex/HF), Eurocircuits (16L, HDI/impedance/RF/IMS), ALLPCB (32L).

---

## 5. Tier 4 — Emerging / reshoring (watch / contact)

The net-new entrants are concentrated in automated *assembly* and AI *design + brokered fab*; net-new bare-board fab capacity is coming from established players (TTM, Calumet) rather than startups.

**New-model / venture-backed:**
- **CircuitHub** — see full profile in Tier 2. The standout genuinely US-manufacturing new model (automated PCBA factory, MA; $28M raised 2026).
- **Diode Computers — diode.computer (order at pcb.new).** YC S24, NY; $11.4M Series A (a16z). AI/code-based PCB **design** automation + instant manufacturing/assembly + cost quoting (aerospace, robotics, medical). **Pushes fab/assembly to a partner network — does not appear to run its own fab; verify domestic-only sourcing per order.** Instant quote at pcb.new. **Contact because** it's a design-first vendor with a domestic-leaning supply chain and an "American PCB renaissance" thesis — engage early for AI-assisted layout.
- **Quilter — quilter.ai.** Menlo Park CA; ~$40M raised (Index/Benchmark/Coatue). Physics-driven AI for autonomous PCB **layout** — **does NOT manufacture** (routes "Fab for Free" prototypes to partner fabs). Include as a *design tool layer* only, not a fab.
- **PCB:NG — pcb.ng.** Brooklyn NY, ~2014 (predates the window). Software-optimized domestic PCBA from uploaded designs. A long-running automated-PCBA option; verify current capacity before relying.

**Established US fabs adding domestic capacity (reliable production options):**
- **TTM Technologies — ttm.com.** ~$130M new Syracuse/DeWitt NY fab for Ultra-HDI (uHDI) + advanced packaging, ramping 2025; defense-oriented. **Watch/contact for** leading-edge, defense-grade, high-layer US boards.
- **Calumet Electronics — calumetelectronics.com.** Michigan; expanding past 200,000 sq ft, building "America's most advanced substrate factory" (with SCHMID), $39.9M DoD DPA Title III. Rigid/flex/rigid-flex + advanced substrates. **For** advanced-package substrates and defense-grade rigid/flex.
- **Summit Interconnect — summitinterconnect.com.** Grew via acquiring Eagle Electronics (adds quick-turn commercial prototyping to its complex/rigid-flex base). Also owns Royal Circuits. US in-house fab + turnkey. **For** quick-turn proto through complex production.

**Do not include (investigated, not real PCB vendors / defunct):** CircuitGenius (unverified; likely a CircuitHub mix-up), Greenluxe (hospitality consultancy), AlphaNov (French photonics center), Tempo Automation (bankrupt Dec 2023).

---

## 6. What you send a fab + what to specify

### Standard deliverables (what you send)
- **Gerbers (RS-274X)** — extended Gerber, one file per copper/mask/silk layer (RS-274X embeds apertures; avoid legacy 274-D). Many shops also accept ODB++ or native KiCad/Altium/EAGLE files.
- **NC drill file (Excellon)** — drill sizes + coordinates; include plated vs non-plated distinction and any slots/cutouts.
- **IPC-D-356 / IPC-356A netlist** — lets the fab electrically test (flying-probe) against intended connectivity; strongly recommended for multilayer.
- **BOM** — for assembly: manufacturer part numbers (MPNs), reference designators, quantities, value/package, DNP (do-not-populate) marked, preferred distributor part numbers.
- **Centroid / pick-and-place (XY) file** — refdes, X, Y, rotation, layer (top/bottom) for every placed part. Required for assembly.
- **Fab drawing** — board outline, dimensions, hole table, stackup, material/finish callouts, tolerances, notes.
- **Assembly drawing** — placement view, orientation/polarity marks (pin 1, diode/cathode, polarized caps), special-handling notes.
- **Stackup notes** — layer order, dielectric thicknesses, copper weights, and impedance-control requirements (target impedance, tolerance, reference planes).

### What to specify on the quote
- **Layer count** (e.g. 2 / 4 / 6).
- **Board thickness** (e.g. 0.8 / 1.0 / 1.6 mm) and any thickness tolerance.
- **Copper weight** (0.5 / 1 / 2 oz; heavier for power).
- **Surface finish** — HASL (cheapest; leaded vs lead-free), **ENIG** (flat, fine-pitch/BGA, longer shelf life, pricier), OSP, immersion silver/tin, hard gold (edge connectors).
- **Soldermask + silkscreen color** (green default/cheapest; others may add cost/lead time).
- **Min trace/space** the design uses (confirm it's within the chosen process, e.g. 6/6 mil vs 4/4 mil vs HDI).
- **Controlled impedance** — yes/no; if yes, target impedance, tolerance, and which layers/nets (provide the stackup).
- **Via type** — through vs blind/buried/microvia; via-in-pad (filled/capped) if used.
- **IPC class** (Class 2 general, Class 3 high-reliability/aero/medical).
- **Panelization / V-score / tab-routing** — single board vs panel/array, V-score vs mouse-bites, panel rails for assembly, fiducials, tooling holes (needed for SMT assembly).
- **Material** (standard FR-4 Tg, high-Tg, Rogers/PTFE for RF, aluminum/metal-core for thermal, polyimide for flex).
- **Quantity + lead time** (standard vs quick-turn — quick-turn carries a premium).
- **Assembly extras** (if PCBA): sides to populate, stencil needed, conformal coating, functional test, IC programming, ROHS/lead-free, ITAR/domestic-only if required.

---

### Sourcing flags to remember
- "US PCB company" does not always mean US-made. Confirmed brokers/hybrids in this list: **San Francisco Circuits** (worldwide network), **Imagineering/pcbnet** (offshore fab in Korea/Taiwan), and **AdvancedPCB's "Global Solutions"** track (offshore). **MacroFab** is North-America network (incl. Mexico) but ITAR. Cleanest genuinely-US-made: **OSH Park, Sierra, Bay Area Circuits, Royal, Sunstone, CircuitHub** (and Screaming Circuits for assembly).
- Ownership/status notes: Royal Circuits -> Summit Interconnect (2022); Sunstone -> American Standard Circuits; Tempo Automation **bankrupt (2023, do not use)**.
- Specs marked "unknown" above were not exposed on the pages reviewed — resolve via each vendor's live instant-quote calculator.
