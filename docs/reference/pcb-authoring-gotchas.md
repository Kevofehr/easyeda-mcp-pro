# PCB Authoring Gotchas (EasyEDA Pro API)

Hard-won quirks when authoring PCB primitives through the bridge
(`eda.pcb_*` via `easyeda_execute`, or the `easyeda_pcb_*` tools). Every item
here was verified live against a running EasyEDA Pro session — they are the
kind of thing the type definitions do **not** tell you.

## Bottom-side silkscreen: rotation is *reflected* on the flipped view

**Symptom:** curved or position-derived silk text placed on the **bottom silk
(layer 4)** — or any bottom-side layer — looks correct in the top-down editor
but appears rotated the *wrong way* ("inverted") when you flip the board over
to the bottom view.

**Cause:** EasyEDA stores every coordinate and rotation in the board's
**top-view frame** (+x right, +y up, rotation CCW-positive). The physical
bottom is viewed **mirrored across the vertical (Y) axis**. A rotation you
derived from position *for the top plane* — e.g. tangential text
`rotation = posAngle − 90` — gets reflected by that mirror, so applying the
same value to bottom-side text reads inverted from the bottom. It is the
classic "did the math in the top plane, not the bottom view" mistake.

**Fix:** reflect the rotation for bottom-side text:

```
rotation_bottom = (360 − rotation_top) mod 360
```

Equivalently, if the top-frame formula was `rotation = posAngle − k`, the
bottom uses `rotation = k − posAngle`, normalized to `[0, 360)`.

Worked example — a curved `TOP` / `BOTTOM` orientation label on the rim:

| char posAngle | top-silk rotation (`pos − 90`) | bottom-silk rotation (`360 − that`, i.e. `90 − pos`) |
| ------------- | ------------------------------ | ---------------------------------------------------- |
| 111°          | 21°                            | **339°**                                             |
| 149°          | 59°                            | **301°**                                             |

## EasyEDA rotations are positive-only (0–360)

EasyEDA does **not** accept negative rotation values — it wraps from 360.
`−20°` must be entered as `340°`. Always normalize authored rotations:

```js
const norm = (a) => ((a % 360) + 360) % 360;
```

## `mirror` is not the same as rotation

The `mirror` field on a silk string flips **glyph handedness** (whether the
letters read forward or backward on the physical face). It does **not** fix
orientation — rotation controls facing, `mirror` controls readability. Set them
independently:

- `mirror = true`  → glyphs read forward on the *physical bottom* face (standard fab convention).
- `mirror = false` → glyphs read forward in the *top-down editor* and match text on the top face; letters are mirror-imaged on the physical bottom.

Pick per intent. Do not reach for `mirror` to correct a rotation problem.

## (context) other live-verified authoring quirks

- **Coordinates are in mil** (1 unit = 0.0254 mm). Use `eda.sys_Unit.mmToMil` /
  `milToMm`. `fontSize` and `lineWidth` args are mil too.
- **`PCB_PrimitiveArc.create` does not register** — author circles/curves as a
  `PCB_PrimitivePolyline` from `pcb_MathPolygon.createPolygon(['CIRCLE', cx, cy, r])`,
  or as line segments.
- **Board cutouts / slots** are closed shapes on the **Board Outline layer (11)**
  (EasyEDA "Slot Region"). They export to the Gerber GKO border / NPTH drill —
  they *do* manufacture — but are **not rendered in the 3D preview**. A hole
  that is missing in 3D is expected behaviour, not a defect.
- **`createPolygon` polygon source must be explicitly closed** for a filled/looped
  shape: repeat the first point at the end → `[x1,y1,'L', …, xn,yn, x1,y1]`.
  An unclosed `'L'` list draws an open path (a rounded rect ends up missing one side).
- **Nothing persists until `PCB_Document.save(documentUuid)`** — created primitives
  are not queryable or rendered until the document is saved.
