import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import gsap from "gsap";
import UPNG from "upng-js";

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

// LCM of animation periods — used for seamless loop duration calculation
// Stroke opacity: 3s, Accent breathe: 3.7s, Dash drift: 4.3s
// We use 3s as the base loop since it gives a clean loop point
const ANIM_DURATIONS = { strokeOpacity: 3, breathe: 3.7, dashDrift: 4.3 };
const LOOP_DURATION_OPTIONS = [3, 5, 8];

function buildAnimationTimeline(svgEl) {
  const tl = gsap.timeline({ paused: true });

  const strokePaths = svgEl.querySelectorAll(".stroke-path");
  const accentPaths = svgEl.querySelectorAll(".accent-path");

  // Stroke opacity pulse: 0.2 → 0.5 over 1.5s, yoyo (3s full cycle)
  if (strokePaths.length) {
    tl.to(strokePaths, {
      attr: { "stroke-opacity": 0.5 },
      duration: ANIM_DURATIONS.strokeOpacity / 2,
      yoyo: true,
      repeat: 1,
      ease: "sine.inOut",
    }, 0);

    // Stroke dash drift
    tl.fromTo(strokePaths, {
      attr: { "stroke-dashoffset": 0 },
    }, {
      attr: { "stroke-dashoffset": -24 },
      duration: ANIM_DURATIONS.dashDrift,
      ease: "none",
    }, 0);
  }

  // Accent breathing: scale 0.97 → 1.03
  if (accentPaths.length) {
    tl.fromTo(accentPaths, {
      scale: 0.97,
    }, {
      scale: 1.03,
      duration: ANIM_DURATIONS.breathe / 2,
      yoyo: true,
      repeat: 1,
      ease: "sine.inOut",
      svgOrigin: undefined, // set per-element below
    }, 0);
  }

  return tl;
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
  const [animateEnabled, setAnimateEnabled] = useState(false);
  const [exportingAnim, setExportingAnim] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [loopDuration, setLoopDuration] = useState(3);

  const svgRef = useRef(null);
  const timelineRef = useRef(null);
  const animFrameRef = useRef(null);

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

  // Build cells with positions
  const cells = useMemo(() => {
    const result = [];
    grid.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        result.push({ ...cell, cx: ci * cellSize, cy: ri * cellSize, ri, ci });
      });
    });
    return result;
  }, [grid, cellSize]);

  // Build the mask path: full canvas rect, then subtract cutout arc shapes using evenodd
  const cutoutHoles = cells
    .filter(c => c.type === "cutout")
    .map(c => getShapePath(c.cx, c.cy, cellSize, c.shape, c.variant))
    .join(" ");

  const maskPath = `M 0 0 H ${canvasSize} V ${canvasSize} H 0 Z ${cutoutHoles}`;

  const stats = { cutout: 0, accent: 0, stroke: 0, solid: 0 };
  cells.forEach(c => stats[c.type]++);

  // GSAP animation setup
  useEffect(() => {
    if (!svgRef.current) return;

    // Kill previous timeline
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (!animateEnabled) {
      // Reset stroke attributes when animation is off
      const strokePaths = svgRef.current.querySelectorAll(".stroke-path");
      const accentPaths = svgRef.current.querySelectorAll(".accent-path");
      strokePaths.forEach(el => {
        el.removeAttribute("stroke-dasharray");
        el.removeAttribute("stroke-dashoffset");
        el.setAttribute("stroke-opacity", "0.4");
      });
      accentPaths.forEach(el => {
        el.removeAttribute("transform");
      });
      return;
    }

    // Set up stroke-dasharray on stroke paths
    const strokePaths = svgRef.current.querySelectorAll(".stroke-path");
    strokePaths.forEach(el => {
      el.setAttribute("stroke-dasharray", "8 4");
      el.setAttribute("stroke-opacity", "0.2");
    });

    // Set transform-origin on accent paths
    const accentPaths = svgRef.current.querySelectorAll(".accent-path");
    accentPaths.forEach(el => {
      const cx = parseFloat(el.dataset.cx) + cellSize / 2;
      const cy = parseFloat(el.dataset.cy) + cellSize / 2;
      gsap.set(el, { svgOrigin: `${cx} ${cy}`, scale: 1 });
    });

    const tl = buildAnimationTimeline(svgRef.current);
    timelineRef.current = tl;

    // Play loop using requestAnimationFrame for smooth playback
    const totalDuration = tl.duration();
    let startTime = null;

    function tick(now) {
      if (!startTime) startTime = now;
      const elapsed = (now - startTime) / 1000; // seconds
      const progress = (elapsed % totalDuration) / totalDuration;
      tl.progress(progress);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      tl.kill();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [animateEnabled, seed, cellSize]);

  const exportSVG = () => {
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

  // Build an SVG string for a single animation frame (no <image>, transparent cutouts)
  const buildFrameSVG = useCallback((frameTimeline, progress) => {
    // Seek timeline to the given progress
    frameTimeline.progress(progress);

    // Read current animated values from the DOM
    const strokePaths = svgRef.current.querySelectorAll(".stroke-path");
    const accentPaths = svgRef.current.querySelectorAll(".accent-path");

    const cutoutHolesPaths = cells
      .filter(c => c.type === "cutout")
      .map(c => getShapePath(c.cx, c.cy, cellSize, c.shape, c.variant))
      .join(" ");

    const frameMaskPath = `M 0 0 H ${canvasSize} V ${canvasSize} H 0 Z ${cutoutHolesPaths}`;

    const elements = [];
    elements.push(`<path d="${frameMaskPath}" fill="${bgColor}" fill-rule="evenodd"/>`);

    // Accent shapes with current transform
    let accentIdx = 0;
    cells.filter(c => c.type === "accent").forEach((cell) => {
      const d = getShapePath(cell.cx, cell.cy, cellSize, cell.shape, cell.variant);
      const el = accentPaths[accentIdx];
      const transform = el ? el.getAttribute("transform") || "" : "";
      const centerX = cell.cx + cellSize / 2;
      const centerY = cell.cy + cellSize / 2;
      // Extract scale from GSAP-applied transform
      const scaleMatch = transform.match(/matrix\(([^,]+)/);
      const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
      elements.push(`<path d="${d}" fill="${cell.accentColor}" transform="translate(${centerX}, ${centerY}) scale(${scale}) translate(${-centerX}, ${-centerY})"/>`);
      accentIdx++;
    });

    // Stroke outlines with current opacity and dash offset
    let strokeIdx = 0;
    cells.filter(c => c.type === "stroke").forEach((cell) => {
      const d = getStrokePath(cell.cx, cell.cy, cellSize, cell.shape, cell.variant);
      const el = strokePaths[strokeIdx];
      const opacity = el ? el.getAttribute("stroke-opacity") || "0.4" : "0.4";
      const dashOffset = el ? el.getAttribute("stroke-dashoffset") || "0" : "0";
      elements.push(`<path d="${d}" fill="none" stroke="${accents[0]}" stroke-opacity="${opacity}" stroke-width="1.5" stroke-dasharray="8 4" stroke-dashoffset="${dashOffset}"/>`);
      strokeIdx++;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize} ${canvasSize}" width="${canvasSize}" height="${canvasSize}">
  ${elements.join("\n  ")}
</svg>`;
  }, [cells, canvasSize, cellSize, bgColor, accents]);

  const exportAnimation = useCallback(async () => {
    if (!svgRef.current || exportingAnim) return;

    setExportingAnim(true);
    setExportProgress(0);

    const fps = 30;
    const totalFrames = Math.round(loopDuration * fps);
    const frames = [];

    // Use the existing timeline for frame seeking
    const tl = timelineRef.current;
    if (!tl) {
      setExportingAnim(false);
      return;
    }

    // Pause the live animation loop during export
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const offCanvas = document.createElement("canvas");
    offCanvas.width = canvasSize;
    offCanvas.height = canvasSize;
    const ctx = offCanvas.getContext("2d");

    for (let i = 0; i < totalFrames; i++) {
      const progress = i / totalFrames;
      const svgString = buildFrameSVG(tl, progress);

      // Render SVG to canvas
      const img = new Image();
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      await new Promise((resolve, reject) => {
        img.onload = () => {
          ctx.clearRect(0, 0, canvasSize, canvasSize);
          ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
          URL.revokeObjectURL(url);

          const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
          frames.push(imageData.data.buffer.slice(0));
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      setExportProgress(Math.round(((i + 1) / totalFrames) * 100));

      // Yield to keep UI responsive
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // Encode as APNG
    const delayMs = Math.round(1000 / fps);
    const delays = new Array(totalFrames).fill(delayMs);
    const apngBuffer = UPNG.encode(frames, canvasSize, canvasSize, 0, delays);

    // Download
    const apngBlob = new Blob([apngBuffer], { type: "image/png" });
    const downloadUrl = URL.createObjectURL(apngBlob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `mask-animation-${seed}-${loopDuration}s.apng`;
    a.click();
    URL.revokeObjectURL(downloadUrl);

    setExportingAnim(false);
    setExportProgress(0);

    // Resume live animation
    if (animateEnabled && timelineRef.current) {
      const totalDuration = timelineRef.current.duration();
      let startTime = null;
      function tick(now) {
        if (!startTime) startTime = now;
        const elapsed = (now - startTime) / 1000;
        const prog = (elapsed % totalDuration) / totalDuration;
        timelineRef.current.progress(prog);
        animFrameRef.current = requestAnimationFrame(tick);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [animateEnabled, buildFrameSVG, canvasSize, exportingAnim, loopDuration, seed]);

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
          {animateEnabled && (
            <button
              onClick={exportAnimation}
              disabled={exportingAnim}
              style={{
                ...btnStyle,
                background: exportingAnim ? "#9b6fbf11" : "#9b6fbf22",
                color: "#9b6fbf",
                borderColor: "#9b6fbf44",
                opacity: exportingAnim ? 0.6 : 1,
              }}
            >
              {exportingAnim ? `Exporting ${exportProgress}%` : "Export Animation"}
            </button>
          )}
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
              return (
                <path
                  key={`a-${i}`}
                  className="accent-path"
                  d={d}
                  fill={cell.accentColor}
                  data-cx={cell.cx}
                  data-cy={cell.cy}
                />
              );
            })}

            {/* Layer 4: Stroke outlines */}
            {cells.filter(c => c.type === "stroke").map((cell, i) => {
              const d = getStrokePath(cell.cx, cell.cy, cellSize, cell.shape, cell.variant);
              return (
                <path
                  key={`s-${i}`}
                  className="stroke-path"
                  d={d}
                  fill="none"
                  stroke={accents[0]}
                  strokeOpacity="0.4"
                  strokeWidth="1.5"
                />
              );
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

            <div style={{ marginBottom: 16 }}>
              <button onClick={() => setAnimateEnabled(a => !a)}
                style={{
                  ...chipStyle, width: "100%", textAlign: "center",
                  background: animateEnabled ? "#9b6fbf22" : "#1a2a33",
                  borderColor: animateEnabled ? "#9b6fbf" : "#2a3e4d",
                  color: animateEnabled ? "#c8a4e8" : "#8aa4b8",
                }}>
                Animate: {animateEnabled ? "ON" : "OFF"}
              </button>
            </div>

            {animateEnabled && (
              <>
                <div style={sectionLabel}>Loop Duration</div>
                <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                  {LOOP_DURATION_OPTIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setLoopDuration(d)}
                      style={{
                        ...chipStyle, flex: 1, textAlign: "center",
                        background: loopDuration === d ? "#9b6fbf22" : "#1a2a33",
                        borderColor: loopDuration === d ? "#9b6fbf" : "#2a3e4d",
                        color: loopDuration === d ? "#c8a4e8" : "#8aa4b8",
                      }}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={sectionLabel}>Grid Map</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, marginBottom: 12 }}>
              {grid.flat().map((cell, i) => {
                const icons = { cutout: "\u25D0", accent: "\u25CF", stroke: "\u25CB", solid: "\u25A0" };
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
                      {cell.type !== "solid" ? `${cell.shape === "half" ? "\u00BD" : "\u00BC"} ${cell.variant}` : "solid"}
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
