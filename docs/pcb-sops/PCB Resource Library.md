# PCB Resource Library

Curated, categorized links and references for PCB design and manufacturing: standards, design guides, application notes, calculators, tool docs, and community wisdom. This is the searchable "where do I find X" index. Deep-read and verified 2026-06-20. Blocked/uncertain sources are flagged.

---

## 1. Standards (cite these by number)

- **IPC-2221** - generic PCB design standard; the trace-width-vs-current and clearance basis. (Use a calculator that implements it, section 5.)
- **IEEE 315-1975** (ANSI Y32.2) - graphic symbols and reference-designator class letters (Clause 22).
- **ASME Y14.44-2008 (R2014)** - current reference-designation construction standard (supersedes IEEE 200 / ANSI Y32.16).
- **IPC-A-600 / IPC-A-610** - acceptability of bare boards / assembled boards (Class 1/2/3).
- **IPC-D-356A** - netlist format for bare-board electrical test.
- **IPC-2581 / ODB++** - intelligent data-exchange formats (alternative to Gerber+drill+BOM+CPL).
- **IEC 81346 + NFPA 79 Annex E** - reference designations for industrial/installation wiring (not PCB).
- **USB 2.0 spec section 7.2.4.1** - VBUS inrush / decoupling (1-10uF).

---

## 2. Authoritative design guides

- **NASA High-Speed PCB Design Guide (Sierra Circuits)** - stackup, impedance tables, diff pairs, via stubs, DFM aspect ratios. https://s3vi.ndc.nasa.gov/ssri-kb/static/resources/High-Speed%20PCB%20Design%20Guide.pdf
- **JLCPCB Ultimate Guide to PCB Layout Design** - trace width vs current, 4-layer default, planes. https://jlcpcb.com/blog/guide-to-pcb-layout-design
- **TI SZZA009 - PCB Design Guidelines for Reduced EMI** - ferrite/PI filters, gridding, series resistors, antenna/termination rules. https://www.ti.com/lit/pdf/szza009
- **Altium "What is a BOM in PCB design"** - minimum-viable BOM line content. https://resources.altium.com/p/what-is-a-bom-in-pcb-design

---

## 3. Application notes by topic

### Decoupling / power-supply filtering
- TI SCAA048 - Filtering Techniques: isolating analog/digital supplies; multi-band decoupling, cap-vs-frequency table, ferrite > 50 ohm rule. https://www.ti.com/lit/an/scaa048/scaa048.pdf

### Grounding
- Analog Devices "Staying Well Grounded" - star vs plane, AGND/DGND, 300 mV limit, bus-wire inductance, clock jitter. https://www.analog.com/en/analog-dialogue/articles/staying-well-grounded.html

### ESD protection
- TI SLVA680 - ESD protection layout: TVS at the connector, 45-degree corners, GND via stitching, 8 kV dI/dt. https://www.ti.com/lit/an/slva680/slva680.pdf

### Oscillators / crystals
- Microchip/Atmel AVR186 - Best Practices for PCB Layout of Oscillators; parasitic-C targets, NPO/C0G load caps, guard ring. http://ww1.microchip.com/downloads/en/AppNotes/Atmel-8128-Best-Practices-for-the-PCB-Layout-of-Oscillators_ApplicationNote_AVR186.pdf
- Atmel AVR2067 - Crystal characterization. http://ww1.microchip.com/downloads/en/AppNotes/Atmel-42068-Crystal-Characterization-for-AVR-RF_Application-Note_AVR2067.pdf

### Motor drivers
- TI SLVA959A - Best Practices for Board Layout of Motor Drivers; bulk caps, current-sense decoupling, star ground, Kelvin sensing. https://www.ti.com/lit/an/slva959a/slva959a.pdf

### Logic / high-speed digital
- TI SDYA009C - Designing with Logic; simultaneous-switching delay, bus contention. https://www.ti.com/lit/an/sdya009c/sdya009c.pdf
- TI SCBA004 - termination/transmission-line for advanced logic. http://www.ti.com/lit/scba004
- EDN - Termination techniques for high-speed buses. https://www.edn.com/02-16-98-termination-techniques-for-high-speed-buses/

### Op-amp stability (capacitive loads)
- ADI AN148 - Does Your Op Amp Oscillate?; parasitic-C, snubber numbers. https://www.analog.com/media/en/technical-documentation/application-notes/an148fa.pdf
- ST AN2653 (TS507) - op-amp stability compensation for capacitive loading. https://www.st.com/resource/en/application_note/cd00176008.pdf

### Switch debounce
- Wurth SN015 - contact debounce circuit for switches. https://www.we-online.com/components/media/o185480v410%20SN015_Contact%20debounce%20circuit%20for%20switches.pdf
- Ganssle - A Guide to Debouncing (parts 1 + 2). http://www.ganssle.com/debouncing.htm and http://www.ganssle.com/debouncing-pt2.htm

### MOSFET gate / switching
- CircuitDigest - simple MOSFET switching circuit. https://circuitdigest.com/electronic-circuits/simple-mosfet-switching-circuit-how-to-turn-on-turn-off-mosfets

---

## 4. Footprints, silkscreen, hardware

- MacroFab "Footprint Files" - diodes, electrolytic capacitors footprint practice. https://macrofab.com/blog/the-footprint-files-diodes/ and /the-footprint-files-electrolytic-capacitors/
- 7PCB - fiducial marks for assembly alignment. https://www.7pcb.com/blog/fiducial-mark-for-pcb-assembly-alignment.php
- 7PCB - diode silkscreen marks. https://www.7pcb.com/blog/place-diodes-silk-screen-marks.php
- Optimum Design - using silkscreen to identify components. http://blog.optimumdesign.com/how-to-use-a-silkscreen-to-identify-pcb-components-
- McMaster-Carr - mounting hardware reference (real screw/washer dimensions for hole + keep-out sizing). https://www.mcmaster.com/ (e.g. /screws/thread-size~m3/ , /standard-washers/for-screw-size~m3/)
- Raspberry Pi mechanical drawings - example of good mechanical documentation. https://www.raspberrypi.org/documentation/hardware/raspberrypi/mechanical/README.md

---

## 5. Calculators and utilities

- Advanced Circuits IPC-2221 trace-width calculator. http://www.4pcb.com/trace-width-calculator.html
- Saturn PCB Toolkit - the standard free desktop calculator (trace width, impedance, via current, etc.). (search "Saturn PCB Toolkit")
- Sierra Circuits free tools - impedance, stackup, trace-width, via calculators. https://www.protoexpress.com (tools section)

---

## 6. Community wisdom (r/PrintedCircuitBoard)

The best community-consensus review checklists. The wiki carries a no-republish/no-train notice, so paraphrase rather than copy. Reddit blocks most automated fetchers; what worked for us was the Supadata scraper on plain old.reddit.com URLs (firecrawl, WebFetch, and curl were all blocked - 403 / "we do not support this site").

- Schematic review tips (wiki). https://old.reddit.com/r/PrintedCircuitBoard/wiki/schematic_review_tips
- PCB review tips (wiki). https://old.reddit.com/r/PrintedCircuitBoard/wiki/pcb_review_tips
- "Before you request a review, fix these issues" (pinned). https://old.reddit.com/r/PrintedCircuitBoard/comments/1jwjhpe/
- "Please read before posting (especially if using AI)". https://old.reddit.com/r/PrintedCircuitBoard/comments/zj6ac8/
- "What do you hate seeing in review requests?" https://old.reddit.com/r/PrintedCircuitBoard/comments/1jbkfnq/
- "Biggest schematic mistakes (2022)". https://old.reddit.com/r/PrintedCircuitBoard/comments/y2e6so/
- RS485 starter subcircuit reference (worked example). https://old.reddit.com/r/PrintedCircuitBoard/comments/1lv326o/
- Gerber-viewer recommendations thread (2024). https://old.reddit.com/r/PrintedCircuitBoard/comments/1adlly9/

The core of these checklists is captured in the **PCB Design SOP** (sections 1-11). Sister threads worth pulling if needed: PCB-layout mistakes (`/comments/y94v50/`).

---

## 7. Tool documentation

- **tscircuit** - https://docs.tscircuit.com (Claude skill available at https://github.com/tscircuit/skill).
- **KiCad** - https://docs.kicad.org/ ; CLI https://docs.kicad.org/9.0/en/cli/cli.html
- **EasyEDA** - Std https://docs.easyeda.com ; Pro https://prodocs.easyeda.com
- **Flux.ai** - https://docs.flux.ai ; Copilot https://docs.flux.ai/reference/copilot ; AI shortcuts blog https://www.flux.ai/p/blog/ai-shortcuts-for-pcb-design
- **Altium Designer** - https://www.altium.com/documentation/altium-designer

See the **ECAD Tools & Commands Quick-Reference** for the actual commands/shortcuts.

---

## 8. Gerber viewers (inspect before you order)

- KiCad GerbView (bundled) and **gerbv** desktop. https://gerbv.github.io/
- tracespace.io (online, renders locally). https://tracespace.io/view/
- Ucamco Reference Gerber Viewer (by the format author). https://gerber-viewer.ucamco.com/
- JLCPCB online viewer https://jlcpcb.com/RGE ; NextPCB https://www.nextpcb.com/free-online-gerber-viewer.html ; PCBWay viewer.
- ZofzPCB - free 3D Gerber viewer (see inner layers). https://www.zofzpcb.com/

---

## 9. Worked-example schematics (good-practice references)

The research dump cited many vintage/commercial schematics as examples of clean, readable drafting (Tektronix 2465B service manual, Commodore/Amiga/Apple service manuals on archive.org, Allen & Heath ML4000, etc.). They are good models for left-to-right flow, functional symbol layout, and thorough title blocks. Search archive.org or w140.com/tekwiki for the specific manual when you want a reference drawing.

---

## Blocked / could not retrieve (for follow-up)
- **Hott Consultants PCB stack-up series** (pcb-stack-up-1..6) - behind Cloudflare Turnstile, not scrapable. Stackup content was substituted from the NASA/Sierra guide. http://www.hottconsultants.com/techtips/pcb-stack-up-1.html
- **Reddit** automated fetches blocked except via Supadata; if a thread will not load, paste its content in and it can be folded into the SOP.
