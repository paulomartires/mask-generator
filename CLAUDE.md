# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite HMR)
npm run build      # Production build
npm run lint       # Run ESLint
npm run preview    # Preview production build
```

There are no tests in this project.

## Architecture

Single-component React app — the entire application lives in `src/App.jsx` (exported as `MaskPatternGenerator`). There is no routing, no state management library, no component decomposition.

### How the mask generation works

The canvas is a 3×3 grid of 600×600px SVG (200px cells). Each cell is assigned one of four types: **cutout**, **accent**, **stroke**, or **solid**. Generation follows strict placement rules:

- Exactly 2 **accent** cells, non-adjacent to each other
- Exactly 2 **stroke** cells, non-adjacent to each other
- Up to 2 **solid** cells, non-adjacent to each other
- Remaining cells become **cutout** (image shows through)

Each cell also gets a shape: **quarter-circle** (80% probability) or **half-circle** (20%), and a directional variant (`tl/tr/bl/br` for quarter, `top/bottom/left/right` for half).

### SVG layering (bottom to top)

1. Full background `<image>` (fills entire canvas)
2. `<path>` with `fill-rule="evenodd"` — the overlay color with arc-shaped holes punched out for cutout cells, letting the image show through
3. Accent `<path>` elements — colored arc shapes drawn over the overlay
4. Stroke `<path>` elements — unfilled arc outlines with reduced opacity

### Key functions

- `generateGrid(rng, params)` — produces the 3×3 cell grid using seeded randomness; `flowMode` makes adjacent quarter-circle corners more likely to connect visually
- `getShapePath(cx, cy, s, shape, variant)` — returns SVG path data for filled arc shapes (used for cutout holes and accent fills)
- `getStrokePath(cx, cy, s, shape, variant)` — returns SVG path data for open arc outlines (used for stroke cells)
- `seededRandom(seed)` — deterministic LCG RNG so the same seed always produces the same pattern

### Export

`exportSVG()` reconstructs the SVG as a standalone file (without the `<image>` element) and triggers a download. The exported SVG is intended to be used as a mask overlay on top of images in other tools.

### ESLint note

`no-unused-vars` ignores variables matching `^[A-Z_]` (uppercase/underscore start), which covers React component names when not directly referenced in JSX.
