# Mask Pattern Generator

A browser-based tool for generating geometric SVG mask patterns built with React and Vite.

## What it does

Generates a 3×3 grid of arc-shaped cells that can be exported as a standalone SVG mask overlay. Each pattern is made up of four cell types:

- **Cutout** — transparent, lets the background image show through
- **Accent** — filled with a custom color
- **Stroke** — an outlined arc at reduced opacity
- **Solid** — filled with the overlay color

Patterns are deterministic — the same seed always produces the same layout.

## Features

- Randomize patterns with a single click
- Adjust overlay color and accent colors
- Toggle **Flow Mode** to visually connect adjacent arc shapes
- Cycle through sample background images or paste a custom image URL
- Export the pattern as a clean SVG file (no embedded image) for use in design tools

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Export

Clicking **Export SVG** downloads a standalone SVG file named `mask-pattern-{seed}.svg`. The exported file contains only the overlay — no background image — so it can be used as a mask layer in Figma, Photoshop, or any other tool.

## Tech stack

- React 19
- Vite 7
- Pure SVG rendering (no canvas, no external drawing libraries)
