# PCB Authoring Gotchas (EasyEDA Pro API)

Hard-won quirks when authoring PCB primitives through the bridge
(`eda.pcb_*` via `easyeda_execute`, or the `easyeda_pcb_*` tools). Every item
here was verified live against a running EasyEDA Pro session. They are the
kind of thing the type definitions do **not** tell you.

## Bottom-side silkscreen: rotation is _reflected_ on the flipped view

**Symptom:** curved or position-derived silk text placed on the **bottom silk
(layer 4)**, or any bottom-side layer, looks correct in the top-down editor
but appears rotated the _wrong way_ ("inverted") when you flip the board over
to the bottom view.

**Cause:** EasyEDA stores every coordinate and rotation in the board's
**top-view frame** (+x right, +y up, rotation CCW-positive). The physical
bottom is viewed **mirrored across the vertical (Y) axis**. A rotation you
derived from position _for the top plane_, e.g. tangential text
`rotation = posAngle − 90`, gets reflected by that mirror, so applying the
same value to bottom-side text reads inverted from the bottom. It is the
classic "did the math in the top plane, not the bottom view" mistake.

**Fix:** reflect the rotation for bottom-side text:

```
rotation_bottom = (360 − rotation_top) mod 360
```

Equivalently, if the top-frame formula was `rotation = posAngle − k`, the
bottom uses `rotation = k − posAngle`, normalized to `[0, 360)`.

Worked example: a curved `TOP` / `BOTTOM` orientation label on the rim:

| char posAngle | top-silk rotation (`pos − 90`) | bottom-silk rotation (`360 − that`, i.e. `90 − pos`) |
| ------------- | ------------------------------ | ---------------------------------------------------- |
| 111°          | 21°                            | **339°**                                             |
| 149°          | 59°                            | **301°**                                             |

## EasyEDA rotations are positive-only (0–360)

EasyEDA does **not** accept negative rotation values. It wraps from 360.
`−20°` must be entered as `340°`. Always normalize authored rotations:

```js
const norm = (a) => ((a % 360) + 360) % 360;
```

## `mirror` is not the same as rotation

The `mirror` field on a silk string flips **glyph handedness** (whether the
letters read forward or backward on the physical face). It does **not** fix
orientation: rotation controls facing, `mirror` controls readability. Set them
independently:

- `mirror = true` → glyphs read forward on the _physical bottom_ face (standard fab convention).
- `mirror = false` → glyphs read forward in the _top-down editor_ and match text on the top face; letters are mirror-imaged on the physical bottom.

Pick per intent. Do not reach for `mirror` to correct a rotation problem.

## (context) other live-verified authoring quirks

- **Coordinates are in mil** (1 unit = 0.0254 mm). Use `eda.sys_Unit.mmToMil` /
  `milToMm`. `fontSize` and `lineWidth` args are mil too.
- **`PCB_PrimitiveArc.create` does not register**. Author circles/curves as a
  `PCB_PrimitivePolyline` from `pcb_MathPolygon.createPolygon(['CIRCLE', cx, cy, r])`,
  or as line segments.
- **Board cutouts / slots** are closed shapes on the **Board Outline layer (11)**
  (EasyEDA "Slot Region"). They export to the Gerber GKO border / NPTH drill.
  They _do_ manufacture, but are **not rendered in the 3D preview**. A hole
  that is missing in 3D is expected behaviour, not a defect.
- **`createPolygon` polygon source must be explicitly closed** for a filled/looped
  shape: repeat the first point at the end → `[x1,y1,'L', …, xn,yn, x1,y1]`.
  An unclosed `'L'` list draws an open path (a rounded rect ends up missing one side).
- **Nothing persists until `PCB_Document.save(documentUuid)`**. Created primitives
  are not queryable or rendered until the document is saved.

## `modify({net})` does NOT rebuild the connection graph → phantom "No Connection" DRC errors

**Symptom:** after re-netting an existing copper primitive (fill/via) with
`PCB_Primitive*.modify(id, {net: "NEW_NET"})`, the DRC "Connection Error"
group reports **No Connection** for the primitive (fills show up as isolated
islands, 2 per net for a top+bottom rim-fill pair) even though geometry and
same-net overlap are perfect. Comparing the flagged primitive to an identical
passing one shows **zero property differences** besides the net name.
Closing and reopening the document does **not** clear it. The stale
connectivity graph is persisted with the document.

**Cause:** EasyEDA builds its copper-connectivity graph when a primitive is
_created_ with its net. `modify({net})` updates the stored net name but never
re-runs graph construction for that primitive, so the connection checker still
sees it as netless/unreachable.

**Fix:** delete + re-create the primitive **with the net set at creation
time**. Create-first-then-delete is the safe ordering (nothing is lost if the
create call fails):

```js
const nid = await eda.pcb_PrimitiveFill.create(
  f.layer,
  f.complexPolygon,
  'NEW_NET',
  f.fillMode,
  f.lineWidth,
);
if (nid) await eda.pcb_PrimitiveFill.delete(oldId);
// vias: eda.pcb_PrimitiveVia.create(net, x, y, holeDiameter, diameter)
```

Verified live 2026-07-06 on the Maker Chip middle/top PCBs: 12 rim
fills/vias re-netted via `modify` all flagged; the same 12 delete+recreated
with net-at-creation → DRC instantly clean. This is the same root cause as the
earlier "oddly, only API-re-netted pads flagged" observation.

**MCP implication:** a `easyeda_pcb_renet_primitive` tool should wrap this
delete+recreate dance instead of exposing raw `modify({net})`.

## Safe Spacing rules have TWO tables: edit both

`config.Spacing["Safe Spacing"].copperThickness1oz.tables` has keys `"1"`
**and** `"2"` with independent row×column clearance matrices. A relaxation
written only to `tables["1"]` (e.g. Fill↔Via = 0 for rim stitch vias inside
their own fills) still fires from `tables["2"]`. Iterate
`Object.keys(rule.tables)` and set the cell in every table. Row name is
`"Fill Region/Teardrop"`, not `"Fill Region"`.

## `pcb_Drc.check()` bare returns a boolean: use `check(true, false, true)`

`await eda.pcb_Drc.check()` returns `false` (not a violation list). The
grouped violation tree comes from `check(true, false, true)`:
`[{name: "Clearance Error", list: [{name: "Track to Via", list: [errs]}]}]`,
with per-error detail (primitive IDs, nets, positions, required clearance) in
`err.explanation.errData`.
