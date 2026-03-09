import { useState, useRef } from "react";

const QUARTER_CORNERS = ["tl", "tr", "bl", "br"];
const HALF_EDGES = ["top", "bottom", "left", "right"];

const DEFAULT_PALETTE = {
  bg: "#1A2A34",
  accents: ["#b8d4e3", "#9b6fbf", "#e87d3e"],
};

const SAMPLE_IMAGES = [
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=2400&q=90",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=2400&q=90",
  "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=2400&q=90",
];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function quarterPath(cx, cy, s, corner) {
  switch (corner) {
    case "tl": return `M ${cx} ${cy} L ${cx + s} ${cy} A ${s} ${s} 0 0 1 ${cx} ${cy + s} Z`;
    case "tr": return `M ${cx + s} ${cy} L ${cx + s} ${cy + s} A ${s} ${s} 0 0 1 ${cx} ${cy} Z`;
    case "br": return `M ${cx + s} ${cy + s} L ${cx} ${cy + s} A ${s} ${s} 0 0 1 ${cx + s} ${cy} Z`;
    case "bl": return `M ${cx} ${cy + s} L ${cx} ${cy} A ${s} ${s} 0 0 1 ${cx + s} ${cy + s} Z`;
    default: return "";
  }
}

function halfShapePath(cx, cy, s, edge) {
  const r = s / 2;
  switch (edge) {
    case "top": return `M ${cx} ${cy} L ${cx + s} ${cy} A ${r} ${r} 0 1 1 ${cx} ${cy} Z`;
    case "bottom": return `M ${cx + s} ${cy + s} L ${cx} ${cy + s} A ${r} ${r} 0 1 1 ${cx + s} ${cy + s} Z`;
    case "left": return `M ${cx} ${cy + s} L ${cx} ${cy} A ${r} ${r} 0 1 1 ${cx} ${cy + s} Z`;
    case "right": return `M ${cx + s} ${cy} L ${cx + s} ${cy + s} A ${r} ${r} 0 1 1 ${cx + s} ${cy} Z`;
    default: return "";
  }
}

function getShapePath(cx, cy, s, shape, variant) {
  return shape === "quarter" ? quarterPath(cx, cy, s, variant) : halfShapePath(cx, cy, s, variant);
}

function getStrokePath(cx, cy, s, shape, variant) {
  if (shape === "quarter") {
    switch (variant) {
      case "tl": return `M ${cx} ${cy} L ${cx + s} ${cy} A ${s} ${s} 0 0 1 ${cx} ${cy + s} L ${cx} ${cy}`;
      case "tr": return `M ${cx + s} ${cy} L ${cx + s} ${cy + s} A ${s} ${s} 0 0 1 ${cx} ${cy} L ${cx + s} ${cy}`;
      case "br": return `M ${cx + s} ${cy + s} L ${cx} ${cy + s} A ${s} ${s} 0 0 1 ${cx + s} ${cy} L ${cx + s} ${cy + s}`;
      case "bl": return `M ${cx} ${cy + s} L ${cx} ${cy} A ${s} ${s} 0 0 1 ${cx + s} ${cy + s} L ${cx} ${cy + s}`;
      default: return "";
    }
  }
  const r = s / 2;
  switch (variant) {
    case "top": return `M ${cx} ${cy} L ${cx + s} ${cy} A ${r} ${r} 0 1 1 ${cx} ${cy}`;
    case "bottom": return `M ${cx + s} ${cy + s} L ${cx} ${cy + s} A ${r} ${r} 0 1 1 ${cx + s} ${cy + s}`;
    case "left": return `M ${cx} ${cy + s} L ${cx} ${cy} A ${r} ${r} 0 1 1 ${cx} ${cy + s}`;
    case "right": return `M ${cx + s} ${cy} L ${cx + s} ${cy + s} A ${r} ${r} 0 1 1 ${cx + s} ${cy}`;
    default: return "";
  }
}

// Adjacency helpers for grid positions (row, col)
function areAdjacent(a, b) {
  return (a[0] === b[0] && Math.abs(a[1] - b[1]) === 1) ||
         (a[1] === b[1] && Math.abs(a[0] - b[0]) === 1);
}

function isAdjacentToAny(pos, positions) {
  return positions.some(p => areAdjacent(pos, p));
}

function pickVariant(rng, shape, grid, row, col, flowMode) {
  if (shape === "half") return HALF_EDGES[Math.floor(rng() * 4)];

  // Flow-aware quarter corner picking
  if (flowMode && col > 0 && grid[row]?.[col - 1]) {
    const prev = grid[row][col - 1];
    if (prev.shape === "quarter" && prev.type !== "solid") {
      if (prev.variant === "tr") return rng() < 0.7 ? "tl" : QUARTER_CORNERS[Math.floor(rng() * 4)];
      if (prev.variant === "br") return rng() < 0.7 ? "bl" : QUARTER_CORNERS[Math.floor(rng() * 4)];
    }
  }
  if (flowMode && row > 0 && grid[row - 1]?.[col]) {
    const prev = grid[row - 1][col];
    if (prev.shape === "quarter" && prev.type !== "solid") {
      if (prev.variant === "bl") return rng() < 0.7 ? "tl" : QUARTER_CORNERS[Math.floor(rng() * 4)];
      if (prev.variant === "br") return rng() < 0.7 ? "tr" : QUARTER_CORNERS[Math.floor(rng() * 4)];
    }
  }
  return QUARTER_CORNERS[Math.floor(rng() * 4)];
}

function generateGrid(rng, params) {
  const allPositions = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) allPositions.push([r, c]);

  // Shuffle positions
  for (let i = allPositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
  }

  const assignments = {};
  const key = (r, c) => `${r},${c}`;

  // Place exactly 2 accent cells, non-adjacent
  const accentPositions = [];
  for (const pos of allPositions) {
    if (accentPositions.length >= 2) break;
    if (!isAdjacentToAny(pos, accentPositions)) {
      accentPositions.push(pos);
      assignments[key(pos[0], pos[1])] = "accent";
    }
  }

  // Place exactly 2 stroke cells, non-adjacent to each other and not on accent cells
  const strokePositions = [];
  for (const pos of allPositions) {
    if (strokePositions.length >= 2) break;
    if (assignments[key(pos[0], pos[1])]) continue;
    if (!isAdjacentToAny(pos, strokePositions)) {
      strokePositions.push(pos);
      assignments[key(pos[0], pos[1])] = "stroke";
    }
  }

  // Place up to 2 solid cells, non-adjacent to each other and not on taken cells
  const solidPositions = [];
  for (const pos of allPositions) {
    if (solidPositions.length >= 2) break;
    if (assignments[key(pos[0], pos[1])]) continue;
    if (!isAdjacentToAny(pos, solidPositions)) {
      solidPositions.push(pos);
      assignments[key(pos[0], pos[1])] = "solid";
    }
  }

  // Build grid, remaining cells are cutout
  const grid = [[], [], []];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const type = assignments[key(r, c)] || "cutout";
      const shape = rng() < 0.2 ? "half" : "quarter";
      const variant = type === "solid" ? "tl" : pickVariant(rng, shape, grid, r, c, params.flowMode);
      const accentColor = params.accents[Math.floor(rng() * params.accents.length)];
      grid[r][c] = { type, shape, variant, accentColor };
    }
  }

  return grid;
}

export default function MaskPatternGenerator() {
  const [seed, setSeed] = useState(42);
  const [bgColor, setBgColor] = useState(DEFAULT_PALETTE.bg);
  const [accents, setAccents] = useState(DEFAULT_PALETTE.accents);
  const [imageUrl, setImageUrl] = useState(SAMPLE_IMAGES[0]);
  const [imageIdx, setImageIdx] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [params, setParams] = useState({
    flowMode: true,
    accents: DEFAULT_PALETTE.accents,
  });
  const svgRef = useRef(null);

  const canvasSize = 600;
  const cellSize = canvasSize / 3;

  const rng = seededRandom(seed);
  const grid = generateGrid(rng, params);

  const randomize = () => setSeed(Math.floor(Math.random() * 99999));
  const cycleImage = () => {
    const next = (imageIdx + 1) % SAMPLE_IMAGES.length;
    setImageIdx(next);
    setImageUrl(SAMPLE_IMAGES[next]);
  };

  const updateAccent = (idx, color) => {
    const next = [...accents];
    next[idx] = color;
    setAccents(next);
    setParams((p) => ({ ...p, accents: next }));
  };

  const exportSVG = () => {
    // SVG with overlay color mask (holes for cutouts), accent shapes, and strokes
    const cutoutHolesPaths = cells
      .filter(c => c.type === "cutout")
      .map(c => getShapePath(c.cx, c.cy, cellSize, c.shape, c.variant))
      .join(" ");

    const exportMaskPath = `M 0 0 H ${canvasSize} V ${canvasSize} H 0 Z ${cutoutHolesPaths}`;

    const elements = [];

    // Overlay color with arc holes punched through
    elements.push(`<path d="${exportMaskPath}" fill="${bgColor}" fill-rule="evenodd"/>`);

    // Accent shapes
    cells.filter(c => c.type === "accent").forEach((cell) => {
      const d = getShapePath(cell.cx, cell.cy, cellSize, cell.shape, cell.variant);
      elements.push(`<path d="${d}" fill="${cell.accentColor}"/>`);
    });

    // Stroke outlines
    cells.filter(c => c.type === "stroke").forEach((cell) => {
      const d = getStrokePath(cell.cx, cell.cy, cellSize, cell.shape, cell.variant);
      elements.push(`<path d="${d}" fill="none" stroke="${accents[0]}" stroke-opacity="0.4" stroke-width="1.5"/>`);
    });

    const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize} ${canvasSize}" width="${canvasSize}" height="${canvasSize}">
  ${elements.join("\n  ")}
</svg>`;

    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mask-pattern-${seed}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build cells with positions
  const cells = [];
  grid.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      cells.push({ ...cell, cx: ci * cellSize, cy: ri * cellSize, ri, ci });
    });
  });

  // Build the mask path: full canvas rect, then subtract cutout arc shapes using evenodd
  // Cutout cells get holes so image shows through their arc
  // Accent cells also get holes (accent shape drawn on top separately)
  const cutoutHoles = cells
    .filter(c => c.type === "cutout")
    .map(c => getShapePath(c.cx, c.cy, cellSize, c.shape, c.variant))
    .join(" ");

  const maskPath = `M 0 0 H ${canvasSize} V ${canvasSize} H 0 Z ${cutoutHoles}`;

  const stats = { cutout: 0, accent: 0, stroke: 0, solid: 0 };
  cells.forEach(c => stats[c.type]++);

  return (
    <div style={{
      background: "#0c161c", width: "100vw", height: "100vh", fontFamily: "'DM Sans', sans-serif",
      display: "flex", flexDirection: "column", color: "#c8d8e4",
      position: "fixed", top: 0, left: 0,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid #1e3040", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e87d3e" }} />
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b92b5" }}>
            Mask Pattern Generator
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowControls(!showControls)} style={btnStyle}>
            {showControls ? "Hide" : "Show"} Controls
          </button>
          <button onClick={exportSVG} style={{ ...btnStyle, background: "#e87d3e22", color: "#e87d3e", borderColor: "#e87d3e44" }}>
            Export SVG
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, minWidth: 0, overflow: "hidden" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${canvasSize} ${canvasSize}`}
            style={{ maxWidth: "100%", maxHeight: "100%", aspectRatio: "1", borderRadius: 4, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
          >
            {/* Layer 1: Full background image */}
            <image
              href={imageUrl}
              x="0" y="0" width={canvasSize} height={canvasSize}
              preserveAspectRatio="xMidYMid slice"
            />

            {/* Layer 2: Bg-color mask with holes for cutout cells (evenodd) */}
            <path d={maskPath} fill={bgColor} fillRule="evenodd" />

            {/* Layer 3: Accent shapes — drawn on top of the mask */}
            {cells.filter(c => c.type === "accent").map((cell, i) => {
              const d = getShapePath(cell.cx, cell.cy, cellSize, cell.shape, cell.variant);
              return <path key={`a-${i}`} d={d} fill={cell.accentColor} />;
            })}

            {/* Layer 4: Stroke outlines */}
            {cells.filter(c => c.type === "stroke").map((cell, i) => {
              const d = getStrokePath(cell.cx, cell.cy, cellSize, cell.shape, cell.variant);
              return <path key={`s-${i}`} d={d} fill="none" stroke={accents[0]} strokeOpacity="0.4" strokeWidth="1.5" />;
            })}
          </svg>
        </div>

        {showControls && (
          <div style={{
            width: 260, background: "#111d25", borderLeft: "1px solid #1e3040",
            padding: 16, overflowY: "auto", fontSize: 12,
          }}>
            <button onClick={randomize} style={{ ...actionBtn, background: "#e87d3e", color: "#0c161c", width: "100%", marginBottom: 16, fontWeight: 500 }}>
              Randomize Pattern
            </button>

            <div style={sectionLabel}>Background Image</div>
            <button onClick={cycleImage} style={{ ...chipStyle, width: "100%", marginBottom: 6, textAlign: "center" }}>
              Cycle Sample Image
            </button>
            <div style={{ marginBottom: 16 }}>
              <input
                type="text" value={imageUrl} placeholder="Paste image URL..."
                onChange={(e) => setImageUrl(e.target.value)}
                style={{
                  width: "100%", background: "#1a2a33", border: "1px solid #2a3e4d", color: "#c8d8e4",
                  padding: "6px 8px", borderRadius: 3, fontSize: 10, fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={sectionLabel}>Overlay Color</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                style={{ width: 32, height: 24, border: "none", background: "none", cursor: "pointer" }} />
              <span style={{ fontSize: 11, color: "#6b8a9e", fontFamily: "monospace" }}>{bgColor}</span>
            </div>

            <div style={sectionLabel}>Accent Colors</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {accents.map((c, i) => (
                <input key={i} type="color" value={c} onChange={(e) => updateAccent(i, e.target.value)}
                  style={{ width: 28, height: 22, border: "none", background: "none", cursor: "pointer" }} />
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <button onClick={() => setParams(p => ({ ...p, flowMode: !p.flowMode }))}
                style={{
                  ...chipStyle, width: "100%", textAlign: "center",
                  background: params.flowMode ? "#e87d3e22" : "#1a2a33",
                  borderColor: params.flowMode ? "#e87d3e" : "#2a3e4d",
                }}>
                Flow mode: {params.flowMode ? "ON" : "OFF"}
              </button>
            </div>

            <div style={sectionLabel}>Grid Map</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, marginBottom: 12 }}>
              {grid.flat().map((cell, i) => {
                const icons = { cutout: "◐", accent: "●", stroke: "○", solid: "■" };
                const colors = {
                  cutout: "#ffffff20", accent: cell.accentColor + "55",
                  stroke: "#ffffff10", solid: bgColor + "88",
                };
                return (
                  <div key={i} style={{
                    aspectRatio: "1", borderRadius: 2, fontSize: 9, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 1,
                    background: colors[cell.type], border: "1px solid #ffffff12", color: "#7b9aae",
                  }}>
                    <span style={{ fontSize: 12 }}>{icons[cell.type]}</span>
                    <span style={{ fontSize: 7 }}>
                      {cell.type !== "solid" ? `${cell.shape === "half" ? "½" : "¼"} ${cell.variant}` : "solid"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={sectionLabel}>Composition</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                { label: "Image", count: stats.cutout, color: "#ffffff" },
                { label: "Accent", count: stats.accent, max: 2, color: accents[1] },
                { label: "Stroke", count: stats.stroke, max: 2, color: accents[0] },
                { label: "Solid", count: stats.solid, max: 2, color: bgColor },
              ].map((s, i) => (
                <div key={i} style={{
                  padding: "3px 8px", borderRadius: 3, fontSize: 10,
                  background: s.color + "22", border: `1px solid ${s.color}33`, color: "#8aa4b8",
                }}>
                  {s.label}: {s.count}{s.max ? `/${s.max}` : ""}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, color: "#3a5060", textAlign: "center" }}>Seed: {seed}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  background: "transparent", border: "1px solid #2a3e4d", color: "#8aa4b8",
  padding: "5px 12px", borderRadius: 3, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
};
const chipStyle = {
  border: "1px solid #2a3e4d", color: "#8aa4b8", padding: "5px 10px",
  borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: "#1a2a33",
};
const sectionLabel = {
  fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1.2,
  color: "#4a6d8c", marginBottom: 8, marginTop: 4,
};
const actionBtn = {
  border: "1px solid #2a3e4d", color: "#c8d8e4", padding: "8px 12px",
  borderRadius: 3, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
};