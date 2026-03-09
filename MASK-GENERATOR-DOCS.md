# Mask Pattern Generator — System Documentation

## What it is

A generative design tool that creates randomized geometric mask overlays for use in presentations, slides, and visual compositions. Built as a React component (JSX) that runs in Claude's artifact viewer or in a Vite/React project.

The generator produces a **3×3 grid of cells**, each containing a quarter-circle or half-circle arc shape. These shapes act as windows into a background image, combined with solid color areas, accent-colored shapes, and stroke outlines to create varied compositions from a single system.

## How it works visually

Imagine a square canvas divided into a 3×3 grid with no gaps between cells. Behind everything sits a photograph. On top of that photo sits a solid-color layer (the overlay). Arc-shaped holes are punched through that overlay, letting the photo show through in curved forms. Some cells get colored shapes instead of photo cutouts. Some get just an outline. The result looks like the photo is being revealed through a geometric pattern.

### Layer stack (bottom to top)

1. **Background image** — full-bleed, scaled to cover the canvas (`xMidYMid slice`)
2. **Overlay mask** — solid color (`#1A2A34`) covering the full canvas, with arc-shaped holes cut using SVG `fill-rule="evenodd"`
3. **Accent shapes** — solid-colored arcs drawn on top of the mask
4. **Stroke outlines** — thin outlined arcs with opacity

## Cell types

Each of the 9 cells is one of four types:

| Type | What it does | Visual result |
|------|-------------|---------------|
| **cutout** | Hole punched in the overlay | Photo shows through an arc shape |
| **accent** | Colored arc shape | Solid color arc (from accent palette) |
| **stroke** | Outlined arc | Thin line drawing the full arc boundary (curve + straight edges) |
| **solid** | Nothing rendered | Overlay color fills the cell entirely |

## Shape types

Each non-solid cell uses one of two shapes:

- **Quarter-circle** (80% chance) — a pie-slice wedge anchored at one of the cell's four corners (`tl`, `tr`, `bl`, `br`). The radius equals the cell size, so the arc sweeps from one edge of the cell to another.
- **Half-circle** (20% chance) — a semicircle with its flat edge along one side of the cell (`top`, `bottom`, `left`, `right`). The radius is half the cell size.

## Composition rules

These are hard constraints enforced during grid generation:

- **Accent cells**: exactly 2, never adjacent horizontally or vertically
- **Stroke cells**: exactly 2, never adjacent horizontally or vertically
- **Solid cells**: max 2, never adjacent horizontally or vertically
- **Cutout cells**: fill all remaining positions (typically 3–5 cells)
- No two solid cells can be neighbors — prevents large rectangular blocks of flat color

The generator uses a **placement-first approach**: shuffle all 9 grid positions, then place accent → stroke → solid in order, checking adjacency constraints at each step. Remaining cells become cutouts.

## Flow mode

When flow mode is ON, the generator biases quarter-circle corner selection to create visual continuity between adjacent cells. For example, if a cell on the left uses corner `tr` (top-right), the cell to its right has a 70% chance of using `tl` (top-left), making the two arcs form a smooth S-curve or petal shape.

Flow mode only affects quarter-circle variant selection. Half-circles pick their edge randomly.

## Color system

- **Overlay color**: `#1A2A34` (dark teal) — the solid layer that covers the image
- **Accent palette**: 3 colors — `#b8d4e3` (light blue), `#9b6fbf` (purple), `#e87d3e` (orange)
- **Stroke color**: uses the first accent color at 40% opacity

All colors are editable via the controls panel.

## SVG export

The exported SVG is meant to be used as an **overlay in PowerPoint**. It contains:

1. The overlay-color mask path with holes for cutouts (evenodd fill)
2. Accent-colored arc shapes
3. Stroke outlines (using `stroke-opacity` not 8-digit hex, for compatibility)

**It does NOT contain the background image.** In PowerPoint, you place your image on the slide first, then layer the exported SVG on top. The arc holes let the image show through.

### PowerPoint workflow

1. Set slide background color to match the overlay color, or place a color-filled rectangle
2. Place your photo on the slide
3. Place the exported SVG on top, sized to cover the photo
4. The photo shows through the arc cutouts; the overlay color frames everything

## SVG path construction

### Quarter-circle paths

Each quarter-circle is a wedge: straight line from the corner to one edge, arc sweep to the other edge, straight line back to the corner.

Example for `tl` (top-left corner):
```
M cx cy          → start at corner
L cx+s cy        → line to top-right of cell
A s s 0 0 1 cx cy+s  → arc to bottom-left of cell
Z                → close back to corner
```

The arc radius equals the cell size `s`.

### Half-circle paths

Each half-circle has its flat edge along one cell side. The radius is `s/2`.

Example for `top` (flat edge at top, bulges down):
```
M cx cy            → start at top-left
L cx+s cy          → line across top edge
A r r 0 1 1 cx cy  → large arc back to start (semicircle)
Z
```

### Stroke paths

Identical geometry to the fill paths but without the `Z` close, rendered with `fill="none"` and a stroke. This draws the full boundary: the two straight edges plus the curve.

### Overlay mask path

A single SVG path combining the full canvas rectangle with all cutout arc paths, using `fill-rule="evenodd"` to punch holes:

```
M 0 0 H 600 V 600 H 0 Z [cutout1 path] [cutout2 path] ...
```

## Key implementation details

- **Seeded random**: deterministic PRNG so each seed always produces the same pattern. Formula: `s = (s * 16807) % 2147483647`
- **Canvas size**: internal viewBox is 600×600, scales to fill viewport via CSS
- **No gaps**: cells sit flush (`cellSize = canvasSize / 3`)
- **8-digit hex avoidance**: stroke opacity uses `stroke-opacity` attribute, not hex alpha, for SVG viewer compatibility
- **Viewport sizing**: root container uses `position: fixed; width: 100vw; height: 100vh` to fill the browser window in the artifact viewer

## File

Single React component file: `mask-generator-v5.jsx`. No dependencies beyond React itself. Uses DM Sans from Google Fonts for the UI.

## Possible future improvements

- **Batch export**: generate N variations and download as a zip
- **Grid size options**: 4×4 or 2×2 grids beyond the current 3×3
- **Image upload**: drag-and-drop local image instead of URL-only
- **PNG export**: rasterize for tools that don't support SVG
- **Animation export**: CSS or GSAP transitions between seeds for video use
- **Figma plugin**: port the generation logic to run inside Figma directly
