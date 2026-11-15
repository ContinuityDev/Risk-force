#!/usr/bin/env node
/**
 * Regenerate all Risk Force SVG sprites with rich near-future military sci-fi art.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sprites");

const C = {
  hull0: "#0a0e14",
  hull1: "#121820",
  hull2: "#1c2733",
  hull3: "#2a3848",
  hull4: "#3d4a5a",
  steel: "#8a9aac",
  steelDim: "#5c6b7e",
  steelLite: "#b0bec8",
  ice: "#7eb6c9",
  iceLite: "#a8d4e0",
  iceHot: "#d4eef5",
  brass: "#c4a574",
  brassDim: "#8a7350",
  brassLite: "#e0c9a0",
  shadow: "rgba(0,0,0,0.45)",
  glow: "rgba(126,182,201,0.35)",
};

function svg(w, h, body, extras = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none">
  <defs>
    <radialGradient id="padG" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1c2733" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#0a0e14" stop-opacity="0.2"/>
    </radialGradient>
    <radialGradient id="coreG" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${C.iceHot}"/>
      <stop offset="45%" stop-color="${C.ice}"/>
      <stop offset="100%" stop-color="#1a4050" stop-opacity="0.8"/>
    </radialGradient>
    <linearGradient id="hullL" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.hull3}"/>
      <stop offset="50%" stop-color="${C.hull2}"/>
      <stop offset="100%" stop-color="${C.hull1}"/>
    </linearGradient>
    <linearGradient id="steelL" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.steelLite}"/>
      <stop offset="40%" stop-color="${C.steel}"/>
      <stop offset="100%" stop-color="${C.steelDim}"/>
    </linearGradient>
    <linearGradient id="brassL" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.brassLite}"/>
      <stop offset="100%" stop-color="${C.brassDim}"/>
    </linearGradient>
    <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${extras}
  </defs>
${body}
</svg>
`;
}

function pad(cx, cy, rx, ry) {
  const rx2 = Math.round(rx * 92) / 100;
  const ry2 = Math.round(ry * 85) / 100;
  return `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#padG)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx2}" ry="${ry2}" fill="none" stroke="${C.hull4}" stroke-width="0.6" opacity="0.5"/>`;
}

function panelLines(x, y, w, h, count = 3) {
  let s = "";
  for (let i = 1; i < count; i++) {
    const px = x + (w * i) / count;
    s += `  <line x1="${px}" y1="${y + 1}" x2="${px}" y2="${y + h - 1}" stroke="${C.hull1}" stroke-width="0.5" opacity="0.6"/>\n`;
  }
  return s;
}

function antenna(x, y, h = 8) {
  return `  <line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="${C.steel}" stroke-width="1"/>
  <circle cx="${x}" cy="${y - h}" r="1.4" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="${x}" cy="${y - h}" r="0.6" fill="${C.iceHot}"/>`;
}

function write(rel, content) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return rel;
}

const written = [];

// ═══════════════════════════════════════════════════════════
// BUILDINGS
// ═══════════════════════════════════════════════════════════

written.push(
  write(
    "buildings/building-nexus.svg",
    svg(
      64,
      64,
      `
${pad(32, 58, 28, 6)}
  <!-- base footprint 2x2 -->
  <path d="M10 52 L10 36 L32 28 L54 36 L54 52 L32 58 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.8"/>
  <path d="M10 36 L32 28 L54 36 L32 44 Z" fill="${C.hull2}"/>
  <path d="M10 36 L10 52 L32 58 L32 44 Z" fill="${C.hull1}"/>
  <path d="M54 36 L54 52 L32 58 L32 44 Z" fill="${C.hull3}"/>
  <!-- upper deck -->
  <path d="M16 40 L16 26 L32 18 L48 26 L48 40 L32 48 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <path d="M16 26 L32 18 L48 26 L32 34 Z" fill="${C.hull3}"/>
  <path d="M16 26 L16 40 L32 48 L32 34 Z" fill="${C.hull2}"/>
  <path d="M48 26 L48 40 L32 48 L32 34 Z" fill="${C.hull4}"/>
${panelLines(18, 28, 28, 14, 4)}
  <!-- central tower -->
  <path d="M24 30 L24 16 L32 12 L40 16 L40 30 L32 34 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.7"/>
  <path d="M24 16 L32 12 L40 16 L32 20 Z" fill="${C.hull3}"/>
  <!-- holo core -->
  <ellipse cx="32" cy="24" rx="7" ry="6" fill="${C.hull0}" stroke="${C.ice}" stroke-width="1.2"/>
  <ellipse cx="32" cy="24" rx="4.5" ry="3.8" fill="url(#coreG)" filter="url(#softGlow)" opacity="0.95"/>
  <ellipse cx="32" cy="23" rx="2" ry="1.5" fill="${C.iceHot}" opacity="0.9"/>
  <!-- brass vents -->
  <rect x="18" y="42" width="5" height="3" rx="0.5" fill="url(#brassL)"/>
  <rect x="41" y="42" width="5" height="3" rx="0.5" fill="url(#brassL)"/>
  <rect x="28" y="46" width="8" height="2" rx="0.3" fill="${C.brass}" opacity="0.7"/>
${antenna(32, 12, 7)}
${antenna(22, 18, 5)}
${antenna(42, 18, 5)}
  <!-- corner lights -->
  <circle cx="14" cy="48" r="1.2" fill="${C.ice}" opacity="0.8"/>
  <circle cx="50" cy="48" r="1.2" fill="${C.ice}" opacity="0.8"/>
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-reactor.svg",
    svg(
      48,
      48,
      `
${pad(24, 44, 20, 4.5)}
  <!-- base ring -->
  <ellipse cx="24" cy="40" rx="16" ry="5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <ellipse cx="24" cy="39" rx="13" ry="4" fill="${C.hull2}"/>
  <!-- cylinder body -->
  <path d="M11 38 L11 18 Q11 12 24 12 Q37 12 37 18 L37 38 Q37 42 24 42 Q11 42 11 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <!-- side shading -->
  <path d="M11 18 Q11 12 24 12 L24 42 Q11 42 11 38 Z" fill="${C.hull1}" opacity="0.45"/>
  <path d="M37 18 Q37 12 24 12 L24 42 Q37 42 37 38 Z" fill="${C.hull3}" opacity="0.35"/>
  <!-- horizontal bands -->
  <ellipse cx="24" cy="20" rx="12.5" ry="3.2" fill="none" stroke="${C.steelDim}" stroke-width="0.6"/>
  <ellipse cx="24" cy="28" rx="12.5" ry="3.2" fill="none" stroke="${C.steelDim}" stroke-width="0.6"/>
  <ellipse cx="24" cy="34" rx="12.5" ry="3" fill="none" stroke="${C.brass}" stroke-width="0.7" opacity="0.8"/>
  <!-- top cap -->
  <ellipse cx="24" cy="16" rx="11" ry="4.5" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.7"/>
  <ellipse cx="24" cy="15.5" rx="7" ry="2.8" fill="${C.hull2}"/>
  <!-- pulsing core -->
  <g id="glow">
    <ellipse cx="24" cy="26" rx="6" ry="7" fill="${C.glow}"/>
    <ellipse cx="24" cy="26" rx="4" ry="5" fill="url(#coreG)" filter="url(#softGlow)"/>
    <ellipse cx="24" cy="25" rx="2" ry="2.5" fill="${C.iceHot}" opacity="0.95"/>
  </g>
  <!-- brass coolant pipes -->
  <path d="M8 30 Q6 26 8 22" stroke="${C.brass}" stroke-width="1.5" fill="none"/>
  <path d="M40 30 Q42 26 40 22" stroke="${C.brass}" stroke-width="1.5" fill="none"/>
  <circle cx="8" cy="22" r="1.5" fill="${C.brassLite}"/>
  <circle cx="40" cy="22" r="1.5" fill="${C.brassLite}"/>
${antenna(24, 12, 5)}
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-refinery.svg",
    svg(
      48,
      48,
      `
${pad(24, 44, 20, 4)}
  <!-- base -->
  <path d="M6 42 L6 32 L24 26 L42 32 L42 42 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M6 32 L24 26 L42 32 L24 38 Z" fill="${C.hull2}"/>
  <!-- main building -->
  <path d="M10 36 L10 22 L24 16 L38 22 L38 36 L24 42 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M10 22 L24 16 L38 22 L24 28 Z" fill="${C.hull3}"/>
${panelLines(12, 24, 24, 12, 3)}
  <!-- smokestack 1 -->
  <rect x="14" y="8" width="5" height="18" rx="0.5" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <rect x="14.5" y="8" width="1.5" height="18" fill="${C.hull1}" opacity="0.5"/>
  <rect x="14" y="7" width="5" height="2" fill="${C.steel}"/>
  <!-- smokestack 2 -->
  <rect x="22" y="5" width="6" height="20" rx="0.5" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.6"/>
  <rect x="22.5" y="5" width="2" height="20" fill="${C.hull2}" opacity="0.4"/>
  <rect x="22" y="4" width="6" height="2.5" fill="url(#steelL)"/>
  <!-- smokestack 3 -->
  <rect x="31" y="10" width="4" height="16" rx="0.4" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.5"/>
  <rect x="31" y="9" width="4" height="1.5" fill="${C.steel}"/>
  <!-- vent paths (subtle) -->
  <path d="M16.5 7 Q14 3 12 1" stroke="${C.steelDim}" stroke-width="1" fill="none" opacity="0.35" stroke-linecap="round"/>
  <path d="M25 4 Q23 0 20 -1" stroke="${C.steelDim}" stroke-width="1.2" fill="none" opacity="0.3" stroke-linecap="round"/>
  <path d="M33 9 Q32 5 30 3" stroke="${C.steelDim}" stroke-width="0.8" fill="none" opacity="0.3" stroke-linecap="round"/>
  <!-- energy conduit -->
  <rect x="20" y="30" width="8" height="3" rx="0.5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.7"/>
  <rect x="21" y="30.5" width="6" height="2" fill="${C.ice}" opacity="0.6"/>
  <!-- brass fittings -->
  <circle cx="12" cy="34" r="1.5" fill="url(#brassL)"/>
  <circle cx="36" cy="34" r="1.5" fill="url(#brassL)"/>
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-fabricator.svg",
    svg(
      64,
      48,
      `
${pad(32, 44, 28, 4)}
  <!-- base pad -->
  <path d="M6 42 L6 34 L32 26 L58 34 L58 42 L32 48 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M6 34 L32 26 L58 34 L32 42 Z" fill="${C.hull2}"/>
  <!-- factory hall -->
  <path d="M10 38 L10 20 L32 12 L54 20 L54 38 L32 46 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <path d="M10 20 L32 12 L54 20 L32 28 Z" fill="${C.hull3}"/>
  <path d="M10 20 L10 38 L32 46 L32 28 Z" fill="${C.hull1}" opacity="0.5"/>
${panelLines(14, 22, 36, 16, 5)}
  <!-- roof ridge lights -->
  <circle cx="20" cy="18" r="1" fill="${C.ice}" opacity="0.8"/>
  <circle cx="32" cy="14" r="1.2" fill="${C.iceLite}" filter="url(#softGlow)"/>
  <circle cx="44" cy="18" r="1" fill="${C.ice}" opacity="0.8"/>
  <!-- assembly bay door -->
  <path d="M24 36 L24 26 L32 22 L40 26 L40 36 L32 40 Z" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.8"/>
  <line x1="32" y1="22" x2="32" y2="40" stroke="${C.ice}" stroke-width="0.5" opacity="0.5"/>
  <rect x="28" y="28" width="8" height="4" fill="url(#coreG)" opacity="0.7"/>
  <!-- crane arm -->
  <rect x="46" y="8" width="3" height="14" fill="${C.steelDim}" stroke="${C.steel}" stroke-width="0.4"/>
  <path d="M47.5 8 L56 14" stroke="${C.steel}" stroke-width="1.5"/>
  <circle cx="56" cy="14" r="1.5" fill="${C.brass}"/>
  <!-- brass vents -->
  <rect x="14" y="32" width="6" height="2.5" rx="0.3" fill="url(#brassL)"/>
  <rect x="44" y="32" width="6" height="2.5" rx="0.3" fill="url(#brassL)"/>
${antenna(32, 12, 6)}
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-shield.svg",
    svg(
      48,
      48,
      `
${pad(24, 44, 16, 3.5)}
  <!-- hexagonal pad -->
  <path d="M24 40 L12 36 L12 28 L24 24 L36 28 L36 36 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <!-- pylon shaft -->
  <path d="M20 36 L20 16 L24 12 L28 16 L28 36 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M20 16 L24 12 L28 16 L24 20 Z" fill="${C.hull3}"/>
  <!-- hex rings on shaft -->
  <path d="M21 22 L24 20.5 L27 22 L24 23.5 Z" fill="none" stroke="${C.ice}" stroke-width="0.6" opacity="0.7"/>
  <path d="M21 28 L24 26.5 L27 28 L24 29.5 Z" fill="none" stroke="${C.brass}" stroke-width="0.6" opacity="0.8"/>
  <!-- emitter head -->
  <path d="M18 16 L24 8 L30 16 L24 18 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.7"/>
  <circle cx="24" cy="13" r="3" fill="${C.hull0}" stroke="${C.ice}" stroke-width="1"/>
  <circle cx="24" cy="13" r="1.5" fill="url(#coreG)" filter="url(#softGlow)"/>
  <!-- translucent shield arc -->
  <path d="M8 28 Q8 8 24 4 Q40 8 40 28" fill="none" stroke="${C.ice}" stroke-width="1.5" opacity="0.45"/>
  <path d="M10 30 Q10 10 24 6 Q38 10 38 30" fill="${C.glow}" stroke="${C.iceLite}" stroke-width="0.8" opacity="0.35"/>
  <path d="M14 32 Q14 14 24 10 Q34 14 34 32" fill="none" stroke="${C.iceLite}" stroke-width="0.5" opacity="0.3"/>
  <!-- brass base fittings -->
  <circle cx="14" cy="38" r="1.5" fill="url(#brassL)"/>
  <circle cx="34" cy="38" r="1.5" fill="url(#brassL)"/>
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-laser.svg",
    svg(
      48,
      48,
      `
${pad(24, 44, 18, 3.5)}
  <!-- circular pad -->
  <ellipse cx="24" cy="40" rx="15" ry="5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <ellipse cx="24" cy="39" rx="11" ry="3.5" fill="${C.hull2}"/>
  <!-- turret base -->
  <path d="M16 38 L16 28 L24 24 L32 28 L32 38 Q32 42 24 42 Q16 42 16 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <ellipse cx="24" cy="28" rx="8" ry="3" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.5"/>
  <!-- rotating ring -->
  <ellipse cx="24" cy="26" rx="6" ry="2.5" fill="${C.hull2}" stroke="${C.brass}" stroke-width="0.7"/>
  <!-- barrel housing -->
  <path d="M20 26 L20 14 L24 10 L28 14 L28 26 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.7"/>
  <path d="M20 14 L24 10 L28 14 L24 17 Z" fill="${C.hull3}"/>
  <!-- barrel -->
  <rect x="22" y="4" width="4" height="12" rx="0.5" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.4"/>
  <rect x="22.5" y="4" width="1.2" height="12" fill="${C.hull0}" opacity="0.4"/>
  <rect x="21.5" y="3" width="5" height="2" rx="0.3" fill="${C.steel}"/>
  <!-- energy tip -->
  <circle cx="24" cy="3" r="1.8" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="24" cy="3" r="0.8" fill="${C.iceHot}"/>
  <!-- side vents -->
  <rect x="12" y="32" width="3" height="4" rx="0.3" fill="url(#brassL)"/>
  <rect x="33" y="32" width="3" height="4" rx="0.3" fill="url(#brassL)"/>
  <!-- glow strip -->
  <rect x="21" y="30" width="6" height="1.5" fill="${C.ice}" opacity="0.6"/>
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-plasma.svg",
    svg(
      48,
      48,
      `
${pad(24, 44, 18, 3.5)}
  <!-- bunker base -->
  <path d="M8 42 L8 30 L24 22 L40 30 L40 42 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.8"/>
  <path d="M8 30 L24 22 L40 30 L24 38 Z" fill="${C.hull2}"/>
  <!-- sloped armor -->
  <path d="M12 38 L12 26 L24 18 L36 26 L36 38 L24 44 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M12 26 L24 18 L36 26 L24 34 Z" fill="${C.hull3}"/>
${panelLines(14, 28, 20, 10, 3)}
  <!-- plasma aperture -->
  <ellipse cx="24" cy="28" rx="7" ry="5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="1.2"/>
  <ellipse cx="24" cy="28" rx="4.5" ry="3.2" fill="url(#coreG)" filter="url(#softGlow)"/>
  <ellipse cx="24" cy="27" rx="2" ry="1.4" fill="${C.iceHot}" opacity="0.95"/>
  <!-- aperture ring -->
  <ellipse cx="24" cy="28" rx="7" ry="5" fill="none" stroke="${C.brass}" stroke-width="0.5" opacity="0.6" stroke-dasharray="2 1.5"/>
  <!-- armor plates -->
  <path d="M10 34 L14 28 L14 36 Z" fill="${C.hull4}" opacity="0.6"/>
  <path d="M38 34 L34 28 L34 36 Z" fill="${C.hull4}" opacity="0.6"/>
  <!-- brass bolts -->
  <circle cx="14" cy="36" r="1" fill="${C.brass}"/>
  <circle cx="34" cy="36" r="1" fill="${C.brass}"/>
${antenna(24, 18, 4)}
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-railgun.svg",
    svg(
      48,
      48,
      `
${pad(24, 44, 18, 3.5)}
  <!-- emplacement base -->
  <path d="M8 42 L8 34 L24 28 L40 34 L40 42 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M8 34 L24 28 L40 34 L24 40 Z" fill="${C.hull2}"/>
  <!-- mount -->
  <path d="M16 38 L16 28 L24 24 L32 28 L32 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <ellipse cx="24" cy="28" rx="8" ry="3" fill="${C.hull3}"/>
  <!-- long barrel (angled up-right) -->
  <g transform="rotate(-25 24 26)">
    <rect x="10" y="23" width="32" height="5" rx="1" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.5"/>
    <rect x="10" y="24" width="32" height="1.5" fill="${C.hull0}" opacity="0.35"/>
    <rect x="8" y="22.5" width="6" height="6" rx="0.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.5"/>
    <rect x="38" y="23.5" width="5" height="4" rx="0.3" fill="${C.steel}"/>
    <circle cx="42" cy="25.5" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  </g>
  <!-- power capacitors -->
  <rect x="12" y="34" width="4" height="5" rx="0.5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.6"/>
  <rect x="32" y="34" width="4" height="5" rx="0.5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.6"/>
  <rect x="13" y="35" width="2" height="3" fill="${C.ice}" opacity="0.5"/>
  <rect x="33" y="35" width="2" height="3" fill="${C.ice}" opacity="0.5"/>
  <!-- brass rails -->
  <line x1="14" y1="40" x2="34" y2="40" stroke="${C.brass}" stroke-width="1" opacity="0.7"/>
`,
    ),
  ),
);

written.push(
  write(
    "buildings/building-flak.svg",
    svg(
      48,
      48,
      `
${pad(24, 44, 16, 3.5)}
  <!-- AA pad -->
  <ellipse cx="24" cy="40" rx="14" ry="5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <!-- turret body -->
  <path d="M14 38 L14 26 L24 20 L34 26 L34 38 Q34 42 24 42 Q14 42 14 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <ellipse cx="24" cy="26" rx="10" ry="4" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.5"/>
  <!-- multi-barrel cluster -->
  <g transform="translate(0,-2)">
    <rect x="17" y="8" width="2.5" height="16" rx="0.4" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.3"/>
    <rect x="21.5" y="5" width="2.5" height="19" rx="0.4" fill="url(#steelL)" stroke="${C.steel}" stroke-width="0.4"/>
    <rect x="26" y="7" width="2.5" height="17" rx="0.4" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.3"/>
    <rect x="30" y="10" width="2" height="14" rx="0.3" fill="${C.steelDim}"/>
    <!-- muzzle tips -->
    <circle cx="18.25" cy="8" r="1" fill="${C.ice}" opacity="0.7"/>
    <circle cx="22.75" cy="5" r="1.2" fill="${C.ice}" filter="url(#softGlow)"/>
    <circle cx="27.25" cy="7" r="1" fill="${C.ice}" opacity="0.7"/>
  </g>
  <!-- ammo drums -->
  <ellipse cx="12" cy="32" rx="3" ry="4" fill="${C.hull2}" stroke="${C.brass}" stroke-width="0.6"/>
  <ellipse cx="36" cy="32" rx="3" ry="4" fill="${C.hull2}" stroke="${C.brass}" stroke-width="0.6"/>
  <!-- targeting sensor -->
  <circle cx="24" cy="24" r="2" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.7"/>
  <circle cx="24" cy="24" r="0.8" fill="${C.iceLite}"/>
`,
    ),
  ),
);

// Remaining buildings with distinctive silhouettes
const buildingDefs = [
  {
    name: "building-missile",
    body: `
${pad(24, 44, 16, 3.5)}
  <ellipse cx="24" cy="40" rx="13" ry="4.5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <path d="M14 38 L14 22 L24 16 L34 22 L34 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M14 22 L24 16 L34 22 L24 28 Z" fill="${C.hull3}"/>
  <!-- missile tubes -->
  <rect x="16" y="10" width="4" height="16" rx="1.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.5"/>
  <rect x="22" y="6" width="4" height="20" rx="1.5" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.6"/>
  <rect x="28" y="10" width="4" height="16" rx="1.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.5"/>
  <circle cx="18" cy="10" r="1.5" fill="${C.ice}" opacity="0.6"/>
  <circle cx="24" cy="6" r="1.8" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="30" cy="10" r="1.5" fill="${C.ice}" opacity="0.6"/>
  <rect x="17" y="32" width="14" height="2" fill="${C.brass}" opacity="0.7"/>
`,
  },
  {
    name: "building-emp",
    body: `
${pad(24, 44, 16, 3.5)}
  <path d="M10 40 L10 28 L24 20 L38 28 L38 40 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M10 28 L24 20 L38 28 L24 36 Z" fill="${C.hull2}"/>
  <!-- tower -->
  <path d="M18 32 L18 14 L24 8 L30 14 L30 32 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M18 14 L24 8 L30 14 L24 18 Z" fill="${C.hull3}"/>
  <!-- emp dish -->
  <ellipse cx="24" cy="12" rx="10" ry="4" fill="none" stroke="${C.ice}" stroke-width="1.2" opacity="0.7"/>
  <ellipse cx="24" cy="12" rx="7" ry="2.8" fill="none" stroke="${C.iceLite}" stroke-width="0.7" opacity="0.5"/>
  <circle cx="24" cy="12" r="2.5" fill="url(#coreG)" filter="url(#softGlow)"/>
  <!-- pulse rings -->
  <circle cx="24" cy="12" r="5" fill="none" stroke="${C.ice}" stroke-width="0.4" opacity="0.35"/>
  <rect x="20" y="34" width="8" height="3" rx="0.5" fill="url(#brassL)"/>
`,
  },
  {
    name: "building-lab",
    body: `
${pad(24, 44, 18, 3.5)}
  <path d="M8 42 L8 30 L24 22 L40 30 L40 42 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M8 30 L24 22 L40 30 L24 38 Z" fill="${C.hull2}"/>
  <path d="M12 36 L12 20 L24 12 L36 20 L36 36 L24 42 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M12 20 L24 12 L36 20 L24 28 Z" fill="${C.hull3}"/>
${panelLines(14, 22, 20, 12, 3)}
  <!-- dome -->
  <ellipse cx="24" cy="16" rx="8" ry="6" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.8"/>
  <ellipse cx="24" cy="15" rx="5" ry="3.5" fill="${C.hull0}" opacity="0.6"/>
  <ellipse cx="24" cy="14" rx="3" ry="2" fill="url(#coreG)" opacity="0.8"/>
  <!-- windows -->
  <rect x="15" y="28" width="4" height="3" rx="0.3" fill="${C.ice}" opacity="0.4"/>
  <rect x="29" y="28" width="4" height="3" rx="0.3" fill="${C.ice}" opacity="0.4"/>
${antenna(24, 10, 6)}
  <rect x="18" y="36" width="12" height="2" fill="${C.brass}" opacity="0.6"/>
`,
  },
  {
    name: "building-supply",
    body: `
${pad(24, 44, 18, 3.5)}
  <path d="M6 42 L6 28 L24 20 L42 28 L42 42 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M6 28 L24 20 L42 28 L24 36 Z" fill="${C.hull2}"/>
  <!-- warehouse -->
  <path d="M10 38 L10 22 L24 14 L38 22 L38 38 L24 44 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M10 22 L24 14 L38 22 L24 30 Z" fill="${C.hull3}"/>
${panelLines(12, 24, 24, 12, 4)}
  <!-- cargo crates -->
  <rect x="14" y="30" width="6" height="5" fill="${C.hull4}" stroke="${C.brass}" stroke-width="0.5"/>
  <rect x="22" y="31" width="5" height="4" fill="${C.hull2}" stroke="${C.brass}" stroke-width="0.4"/>
  <rect x="30" y="30" width="6" height="5" fill="${C.hull4}" stroke="${C.brass}" stroke-width="0.5"/>
  <!-- door -->
  <path d="M20 38 L20 32 L24 30 L28 32 L28 38 Z" fill="${C.hull0}" stroke="${C.steelDim}" stroke-width="0.5"/>
${antenna(24, 14, 4)}
`,
  },
  {
    name: "building-drydock",
    w: 64,
    h: 64,
    body: `
${pad(32, 58, 28, 5)}
  <!-- dock basin -->
  <path d="M6 56 L6 44 L32 34 L58 44 L58 56 L32 62 Z" fill="${C.hull0}" stroke="${C.steelDim}" stroke-width="0.8"/>
  <path d="M12 52 L12 44 L32 36 L52 44 L52 52 L32 58 Z" fill="#0d1520" stroke="${C.ice}" stroke-width="0.5" opacity="0.85"/>
  <!-- gantries -->
  <rect x="8" y="16" width="5" height="36" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.6"/>
  <rect x="51" y="16" width="5" height="36" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.6"/>
  <rect x="8.5" y="16" width="1.5" height="36" fill="${C.hull1}" opacity="0.5"/>
  <rect x="51.5" y="16" width="1.5" height="36" fill="${C.hull1}" opacity="0.5"/>
  <!-- crane beam -->
  <rect x="8" y="14" width="48" height="4" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.5"/>
  <rect x="28" y="8" width="4" height="10" fill="${C.steelDim}"/>
  <circle cx="30" cy="8" r="2" fill="${C.brass}"/>
  <line x1="30" y1="10" x2="30" y2="30" stroke="${C.steel}" stroke-width="1" opacity="0.5"/>
  <!-- hull being worked -->
  <ellipse cx="32" cy="46" rx="14" ry="4" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.6"/>
  <rect x="20" y="38" width="24" height="8" rx="1.5" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.5"/>
  <rect x="28" y="40" width="8" height="3" fill="${C.ice}" opacity="0.5"/>
  <circle cx="22" cy="42" r="1" fill="${C.brass}"/>
  <circle cx="42" cy="42" r="1" fill="${C.brass}"/>
`,
  },
  {
    name: "building-uplink",
    w: 64,
    h: 48,
    body: `
${pad(32, 44, 24, 3.5)}
  <ellipse cx="32" cy="40" rx="18" ry="5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <path d="M22 38 L22 26 L32 18 L42 26 L42 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <!-- dish -->
  <ellipse cx="32" cy="16" rx="16" ry="10" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.9"/>
  <ellipse cx="32" cy="16" rx="12" ry="7" fill="${C.hull1}" stroke="${C.ice}" stroke-width="0.7" opacity="0.9"/>
  <ellipse cx="32" cy="15" rx="6" ry="3.5" fill="${C.hull0}"/>
  <line x1="32" y1="22" x2="32" y2="10" stroke="${C.steel}" stroke-width="1.4"/>
  <circle cx="32" cy="9" r="2.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="32" cy="9" r="1" fill="${C.iceHot}"/>
  <rect x="29" y="26" width="6" height="12" fill="${C.hull3}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <rect x="24" y="36" width="16" height="2.5" fill="${C.brass}" opacity="0.7"/>
`,
  },
  {
    name: "building-jammer",
    body: `
${pad(24, 44, 15, 3.5)}
  <ellipse cx="24" cy="40" rx="12" ry="4" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <path d="M18 38 L18 20 L24 14 L30 20 L30 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M18 20 L24 14 L30 20 L24 24 Z" fill="${C.hull3}"/>
  <!-- spire array -->
  <line x1="20" y1="16" x2="16" y2="4" stroke="${C.steel}" stroke-width="1.2"/>
  <line x1="24" y1="14" x2="24" y2="2" stroke="${C.steel}" stroke-width="1.5"/>
  <line x1="28" y1="16" x2="32" y2="4" stroke="${C.steel}" stroke-width="1.2"/>
  <circle cx="16" cy="4" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="24" cy="2" r="2" fill="${C.iceLite}" filter="url(#softGlow)"/>
  <circle cx="32" cy="4" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <!-- wave arcs -->
  <path d="M10 12 Q24 0 38 12" fill="none" stroke="${C.ice}" stroke-width="0.6" opacity="0.4"/>
  <path d="M12 16 Q24 6 36 16" fill="none" stroke="${C.ice}" stroke-width="0.4" opacity="0.3"/>
  <rect x="20" y="30" width="8" height="3" rx="0.5" fill="url(#brassL)"/>
`,
  },
  {
    name: "building-repair",
    body: `
${pad(24, 44, 18, 3.5)}
  <path d="M6 42 L6 30 L24 22 L42 30 L42 42 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M6 30 L24 22 L42 30 L24 38 Z" fill="${C.hull2}"/>
  <path d="M10 38 L10 24 L24 16 L38 24 L38 38 L24 44 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M10 24 L24 16 L38 24 L24 32 Z" fill="${C.hull3}"/>
  <!-- repair bay opening -->
  <path d="M18 36 L18 26 L24 22 L30 26 L30 36 Z" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.8"/>
  <rect x="20" y="28" width="8" height="4" fill="${C.ice}" opacity="0.35"/>
  <!-- arm -->
  <path d="M34 20 L40 12 L42 14" stroke="${C.steel}" stroke-width="1.5" fill="none"/>
  <circle cx="40" cy="12" r="2" fill="${C.brass}"/>
  <circle cx="40" cy="12" r="0.8" fill="${C.ice}"/>
${panelLines(12, 26, 24, 10, 3)}
  <rect x="14" y="34" width="5" height="2" fill="${C.brass}" opacity="0.7"/>
`,
  },
  {
    name: "building-geothermal",
    body: `
${pad(24, 44, 18, 3.5)}
  <ellipse cx="24" cy="40" rx="15" ry="5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <!-- well head -->
  <path d="M14 38 L14 24 L24 16 L34 24 L34 38 Q34 42 24 42 Q14 42 14 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <ellipse cx="24" cy="24" rx="10" ry="4" fill="${C.hull3}"/>
  <!-- heat vents -->
  <ellipse cx="24" cy="28" rx="5" ry="4" fill="${C.hull0}" stroke="${C.brass}" stroke-width="1"/>
  <ellipse cx="24" cy="28" rx="3" ry="2.5" fill="#c47850" opacity="0.7"/>
  <ellipse cx="24" cy="27" rx="1.5" ry="1.2" fill="${C.brassLite}" opacity="0.8"/>
  <!-- pipes -->
  <path d="M10 30 Q6 26 10 20 L14 20" stroke="${C.brass}" stroke-width="2" fill="none"/>
  <path d="M38 30 Q42 26 38 20 L34 20" stroke="${C.brass}" stroke-width="2" fill="none"/>
  <!-- steam -->
  <path d="M22 16 Q20 10 22 6" stroke="${C.steelDim}" stroke-width="1" opacity="0.3" fill="none"/>
  <path d="M26 16 Q28 10 26 6" stroke="${C.steelDim}" stroke-width="1" opacity="0.3" fill="none"/>
${antenna(24, 16, 3)}
`,
  },
  {
    name: "building-coastal",
    w: 64,
    h: 48,
    body: `
${pad(32, 44, 26, 3.5)}
  <path d="M8 42 L8 32 L32 24 L56 32 L56 42 L32 48 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.8"/>
  <path d="M8 32 L32 24 L56 32 L32 40 Z" fill="${C.hull2}"/>
  <!-- bunker -->
  <path d="M14 38 L14 24 L32 14 L50 24 L50 38 L32 46 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <path d="M14 24 L32 14 L50 24 L32 34 Z" fill="${C.hull3}"/>
  <!-- coastal gun -->
  <g transform="rotate(-12 38 22)">
    <rect x="28" y="18" width="28" height="5" rx="1" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.5"/>
    <rect x="26" y="17" width="7" height="7" rx="0.6" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.5"/>
    <circle cx="55" cy="20.5" r="2" fill="${C.ice}" filter="url(#softGlow)"/>
  </g>
  <rect x="16" y="34" width="7" height="5" fill="${C.hull4}" stroke="${C.brass}" stroke-width="0.5"/>
  <rect x="42" y="34" width="7" height="5" fill="${C.hull4}" stroke="${C.brass}" stroke-width="0.5"/>
${antenna(20, 22, 5)}
`,
  },
  {
    name: "building-silo",
    w: 64,
    h: 64,
    body: `
${pad(32, 58, 20, 4.5)}
  <ellipse cx="32" cy="54" rx="16" ry="5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <!-- silo cylinder -->
  <path d="M18 52 L18 16 Q18 8 32 8 Q46 8 46 16 L46 52 Q46 58 32 58 Q18 58 18 52 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="1"/>
  <path d="M18 16 Q18 8 32 8 L32 58 Q18 58 18 52 Z" fill="${C.hull1}" opacity="0.4"/>
  <ellipse cx="32" cy="14" rx="13" ry="5" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.6"/>
  <ellipse cx="32" cy="26" rx="13.5" ry="3.5" fill="none" stroke="${C.brass}" stroke-width="1.4" opacity="0.75"/>
  <ellipse cx="32" cy="40" rx="13.5" ry="3.5" fill="none" stroke="${C.brass}" stroke-width="1.4" opacity="0.75"/>
  <ellipse cx="32" cy="14" rx="5" ry="2.2" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.8"/>
  <circle cx="32" cy="14" r="1.5" fill="${C.ice}" opacity="0.7"/>
${antenna(32, 8, 5)}
`,
  },
  {
    name: "building-point-defense",
    body: `
${pad(24, 44, 14, 3)}
  <ellipse cx="24" cy="40" rx="11" ry="4" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <path d="M16 38 L16 26 L24 20 L32 26 L32 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <ellipse cx="24" cy="26" rx="8" ry="3" fill="${C.hull3}"/>
  <!-- CIWS barrels -->
  <g>
    <rect x="20" y="10" width="2" height="14" rx="0.3" fill="url(#steelL)"/>
    <rect x="23" y="8" width="2" height="16" rx="0.3" fill="url(#steelL)"/>
    <rect x="26" y="10" width="2" height="14" rx="0.3" fill="url(#steelL)"/>
    <circle cx="21" cy="10" r="0.8" fill="${C.ice}" opacity="0.7"/>
    <circle cx="24" cy="8" r="1" fill="${C.ice}" filter="url(#softGlow)"/>
    <circle cx="27" cy="10" r="0.8" fill="${C.ice}" opacity="0.7"/>
  </g>
  <!-- radar dome -->
  <circle cx="24" cy="24" r="3" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.6"/>
  <circle cx="24" cy="24" r="1.2" fill="${C.iceLite}" opacity="0.7"/>
  <rect x="18" y="34" width="12" height="2" fill="${C.brass}" opacity="0.6"/>
`,
  },
  {
    name: "building-shield-gen",
    w: 64,
    h: 64,
    body: `
${pad(32, 58, 24, 4.5)}
  <path d="M10 54 L10 38 L32 26 L54 38 L54 54 L32 60 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.8"/>
  <path d="M10 38 L32 26 L54 38 L32 50 Z" fill="${C.hull2}"/>
  <path d="M16 48 L16 26 L32 14 L48 26 L48 48 L32 56 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <path d="M16 26 L32 14 L48 26 L32 38 Z" fill="${C.hull3}"/>
  <path d="M32 22 L38 25 L38 31 L32 34 L26 31 L26 25 Z" fill="${C.hull0}" stroke="${C.ice}" stroke-width="1.2"/>
  <circle cx="32" cy="28" r="3" fill="url(#coreG)" filter="url(#softGlow)"/>
  <ellipse cx="32" cy="28" rx="20" ry="14" fill="none" stroke="${C.ice}" stroke-width="1" opacity="0.3"/>
  <ellipse cx="32" cy="28" rx="15" ry="11" fill="${C.glow}" opacity="0.15"/>
  <rect x="24" y="46" width="16" height="3" rx="0.4" fill="url(#brassL)"/>
${antenna(32, 14, 6)}
`,
  },
  {
    name: "building-cyber",
    body: `
${pad(24, 44, 16, 3.5)}
  <path d="M10 42 L10 28 L24 20 L38 28 L38 42 L24 46 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M10 28 L24 20 L38 28 L24 36 Z" fill="${C.hull2}"/>
  <path d="M14 36 L14 18 L24 10 L34 18 L34 36 L24 42 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M14 18 L24 10 L34 18 L24 26 Z" fill="${C.hull3}"/>
  <!-- data core -->
  <rect x="19" y="22" width="10" height="10" rx="1" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.9"/>
  <rect x="21" y="24" width="6" height="2" fill="${C.ice}" opacity="0.6"/>
  <rect x="21" y="27" width="4" height="1.5" fill="${C.iceLite}" opacity="0.5"/>
  <rect x="21" y="29.5" width="5" height="1.5" fill="${C.ice}" opacity="0.4"/>
  <!-- uplink nodes -->
  <circle cx="16" cy="16" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="32" cy="16" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <line x1="16" y1="16" x2="24" y2="12" stroke="${C.ice}" stroke-width="0.5" opacity="0.5"/>
  <line x1="32" y1="16" x2="24" y2="12" stroke="${C.ice}" stroke-width="0.5" opacity="0.5"/>
${antenna(24, 10, 5)}
  <rect x="18" y="36" width="12" height="2" fill="${C.brass}" opacity="0.6"/>
`,
  },
  {
    name: "building-war-college",
    w: 64,
    h: 48,
    body: `
${pad(32, 44, 28, 4)}
  <path d="M6 42 L6 30 L32 20 L58 30 L58 42 L32 48 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.8"/>
  <path d="M6 30 L32 20 L58 30 L32 40 Z" fill="${C.hull2}"/>
  <path d="M10 38 L10 20 L32 8 L54 20 L54 38 L32 48 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="1"/>
  <path d="M10 20 L32 8 L54 20 L32 32 Z" fill="${C.hull3}"/>
${panelLines(14, 22, 36, 14, 5)}
  <path d="M26 18 L32 2 L38 18 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.7"/>
  <circle cx="32" cy="5" r="2.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <rect x="14" y="28" width="4" height="12" fill="${C.hull4}" stroke="${C.brass}" stroke-width="0.5"/>
  <rect x="46" y="28" width="4" height="12" fill="${C.hull4}" stroke="${C.brass}" stroke-width="0.5"/>
  <path d="M26 42 L26 32 L32 28 L38 32 L38 42 Z" fill="${C.hull0}" stroke="${C.brass}" stroke-width="0.7"/>
  <rect x="29" y="34" width="6" height="2.5" fill="${C.ice}" opacity="0.4"/>
`,
  },
  {
    name: "building-sonar",
    body: `
${pad(24, 44, 16, 3.5)}
  <ellipse cx="24" cy="40" rx="13" ry="4.5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <path d="M14 38 L14 26 L24 20 L34 26 L34 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <!-- dome -->
  <ellipse cx="24" cy="22" rx="12" ry="10" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.8"/>
  <ellipse cx="24" cy="20" rx="9" ry="7" fill="${C.hull3}" opacity="0.7"/>
  <ellipse cx="24" cy="18" rx="5" ry="4" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.8"/>
  <circle cx="24" cy="17" r="2" fill="url(#coreG)" filter="url(#softGlow)"/>
  <!-- sonar rings -->
  <circle cx="24" cy="18" r="7" fill="none" stroke="${C.ice}" stroke-width="0.4" opacity="0.35"/>
  <circle cx="24" cy="18" r="10" fill="none" stroke="${C.ice}" stroke-width="0.3" opacity="0.25"/>
  <rect x="18" y="34" width="12" height="2.5" fill="${C.brass}" opacity="0.7"/>
`,
  },
  {
    name: "building-dark-matter",
    w: 64,
    h: 64,
    body: `
${pad(32, 58, 24, 4.5)}
  <path d="M10 54 L10 38 L32 26 L54 38 L54 54 L32 60 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.8"/>
  <path d="M10 38 L32 26 L54 38 L32 50 Z" fill="${C.hull2}"/>
  <path d="M14 48 L14 22 L32 8 L50 22 L50 48 L32 56 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="1"/>
  <path d="M14 22 L32 8 L50 22 L32 36 Z" fill="${C.hull3}"/>
  <ellipse cx="32" cy="28" rx="14" ry="11" fill="${C.hull0}" stroke="${C.ice}" stroke-width="1.4"/>
  <ellipse cx="32" cy="28" rx="9" ry="7" fill="none" stroke="${C.brass}" stroke-width="0.9" opacity="0.85"/>
  <ellipse cx="32" cy="28" rx="6" ry="4.5" fill="#050810" stroke="${C.iceLite}" stroke-width="1"/>
  <ellipse cx="32" cy="26" rx="2.5" ry="1.8" fill="${C.ice}" opacity="0.55" filter="url(#softGlow)"/>
  <line x1="16" y1="18" x2="26" y2="24" stroke="${C.steel}" stroke-width="1.2"/>
  <line x1="48" y1="18" x2="38" y2="24" stroke="${C.steel}" stroke-width="1.2"/>
  <circle cx="16" cy="18" r="2" fill="${C.brass}"/>
  <circle cx="48" cy="18" r="2" fill="${C.brass}"/>
`,
  },
  {
    name: "building-orbital-collector",
    body: `
${pad(24, 44, 16, 3.5)}
  <ellipse cx="24" cy="40" rx="13" ry="4" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <!-- base -->
  <path d="M16 38 L16 28 L24 22 L32 28 L32 38 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <!-- mast -->
  <rect x="22.5" y="10" width="3" height="20" fill="${C.steelDim}" stroke="${C.steel}" stroke-width="0.4"/>
  <!-- collector panels -->
  <path d="M8 18 L22 12 L22 20 L8 26 Z" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.6"/>
  <path d="M40 18 L26 12 L26 20 L40 26 Z" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.6"/>
  <line x1="12" y1="20" x2="20" y2="16" stroke="${C.ice}" stroke-width="0.4" opacity="0.5"/>
  <line x1="36" y1="20" x2="28" y2="16" stroke="${C.ice}" stroke-width="0.4" opacity="0.5"/>
  <!-- tip -->
  <circle cx="24" cy="9" r="2.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="24" cy="9" r="1" fill="${C.iceHot}"/>
  <rect x="18" y="34" width="12" height="2" fill="${C.brass}" opacity="0.7"/>
`,
  },
];

for (const b of buildingDefs) {
  written.push(write(`buildings/${b.name}.svg`, svg(b.w ?? 48, b.h ?? 48, b.body)));
}

// ═══════════════════════════════════════════════════════════
// UNITS — 3/4 side view, distinctive silhouettes
// ═══════════════════════════════════════════════════════════

function unitSvg(w, h, body) {
  return svg(w, h, body);
}

written.push(
  write(
    "units/unit-trooper.svg",
    unitSvg(
      32,
      32,
      `
  <ellipse cx="16" cy="30" rx="7" ry="2" fill="${C.shadow}"/>
  <!-- legs -->
  <path d="M11 22 L9 29 L13 29 L14 22 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <path d="M18 22 L17 29 L21 29 L21 22 Z" fill="${C.hull3}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <!-- torso armor -->
  <path d="M10 12 L10 22 L16 24 L22 22 L22 12 L16 10 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <path d="M10 12 L16 10 L22 12 L16 15 Z" fill="${C.hull3}"/>
  <path d="M13 14 L16 13 L19 14 L19 19 L16 20 L13 19 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <circle cx="16" cy="16" r="1.3" fill="${C.ice}" opacity="0.7"/>
  <!-- helmet -->
  <ellipse cx="16" cy="7" rx="4.5" ry="4.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.6"/>
  <ellipse cx="16" cy="6.5" rx="3" ry="2" fill="${C.hull0}"/>
  <rect x="13" y="5.5" width="6" height="1.8" rx="0.4" fill="${C.ice}" opacity="0.8"/>
  <rect x="22" y="14" width="7" height="1.3" rx="0.3" fill="url(#steelL)"/>
  <rect x="21" y="13" width="2" height="2.5" fill="${C.hull3}"/>
  <ellipse cx="10" cy="13" rx="2.2" ry="1.8" fill="${C.hull4}" stroke="${C.brass}" stroke-width="0.4"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-mech.svg",
    unitSvg(
      48,
      48,
      `
  <ellipse cx="24" cy="45" rx="14" ry="2.5" fill="${C.shadow}"/>
  <!-- left leg -->
  <path d="M12 28 L8 42 L14 42 L16 30 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.6"/>
  <path d="M10 36 L7 42 L13 42" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <!-- right leg -->
  <path d="M28 28 L26 42 L34 42 L34 30 Z" fill="${C.hull3}" stroke="${C.steel}" stroke-width="0.6"/>
  <path d="M28 36 L27 42 L35 42" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <!-- hip -->
  <ellipse cx="22" cy="28" rx="10" ry="4" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.5"/>
  <!-- torso -->
  <path d="M12 12 L12 28 L22 32 L32 28 L32 12 L22 8 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <path d="M12 12 L22 8 L32 12 L22 18 Z" fill="${C.hull3}"/>
${panelLines(14, 14, 16, 12, 3)}
  <!-- cockpit -->
  <ellipse cx="22" cy="16" rx="5" ry="4" fill="${C.hull0}" stroke="${C.ice}" stroke-width="1"/>
  <ellipse cx="22" cy="15" rx="3" ry="2.2" fill="url(#coreG)" opacity="0.85"/>
  <!-- left arm / weapon -->
  <path d="M8 14 L4 24 L8 26 L12 18 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.5"/>
  <rect x="2" y="22" width="8" height="3" rx="0.5" fill="url(#steelL)"/>
  <circle cx="2" cy="23.5" r="1.2" fill="${C.ice}" filter="url(#softGlow)"/>
  <!-- right arm -->
  <path d="M32 14 L36 22 L32 26 L28 18 Z" fill="${C.hull3}" stroke="${C.steelDim}" stroke-width="0.5"/>
  <!-- shoulder brass -->
  <circle cx="12" cy="12" r="2.5" fill="url(#brassL)"/>
  <circle cx="32" cy="12" r="2.5" fill="url(#brassL)"/>
  <!-- antenna -->
  <line x1="26" y1="8" x2="28" y2="2" stroke="${C.steel}" stroke-width="1"/>
  <circle cx="28" cy="2" r="1.2" fill="${C.ice}"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-hover.svg",
    unitSvg(
      48,
      36,
      `
  <ellipse cx="24" cy="32" rx="16" ry="3" fill="${C.shadow}"/>
  <!-- anti-grav glow undercarriage -->
  <ellipse cx="24" cy="28" rx="14" ry="3" fill="${C.glow}" filter="url(#softGlow)"/>
  <ellipse cx="24" cy="28" rx="10" ry="2" fill="${C.ice}" opacity="0.35"/>
  <!-- hull -->
  <path d="M6 22 L10 14 L24 10 L38 14 L42 22 L38 26 L24 28 L10 26 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <path d="M10 14 L24 10 L38 14 L24 18 Z" fill="${C.hull3}"/>
${panelLines(12, 16, 24, 8, 4)}
  <!-- turret -->
  <ellipse cx="24" cy="16" rx="6" ry="4" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.6"/>
  <rect x="22" y="6" width="4" height="10" rx="0.5" fill="url(#steelL)"/>
  <circle cx="24" cy="6" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <!-- side thrusters -->
  <ellipse cx="8" cy="22" rx="3" ry="2.5" fill="${C.hull1}" stroke="${C.ice}" stroke-width="0.5"/>
  <ellipse cx="40" cy="22" rx="3" ry="2.5" fill="${C.hull1}" stroke="${C.ice}" stroke-width="0.5"/>
  <circle cx="8" cy="22" r="1" fill="${C.iceLite}" opacity="0.7"/>
  <circle cx="40" cy="22" r="1" fill="${C.iceLite}" opacity="0.7"/>
  <!-- brass trim -->
  <line x1="12" y1="24" x2="36" y2="24" stroke="${C.brass}" stroke-width="0.7" opacity="0.7"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-siege.svg",
    unitSvg(
      48,
      40,
      `
  <ellipse cx="24" cy="37" rx="16" ry="2.5" fill="${C.shadow}"/>
  <!-- tracks -->
  <rect x="6" y="28" width="36" height="7" rx="2" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <rect x="8" y="29" width="4" height="5" fill="${C.hull3}"/>
  <rect x="14" y="29" width="4" height="5" fill="${C.hull3}"/>
  <rect x="30" y="29" width="4" height="5" fill="${C.hull3}"/>
  <rect x="36" y="29" width="4" height="5" fill="${C.hull3}"/>
  <!-- chassis -->
  <path d="M8 28 L8 18 L24 12 L40 18 L40 28 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M8 18 L24 12 L40 18 L24 22 Z" fill="${C.hull3}"/>
  <!-- siege cannon -->
  <g transform="rotate(-20 28 18)">
    <rect x="16" y="14" width="28" height="5" rx="1" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.5"/>
    <rect x="16" y="15" width="28" height="1.5" fill="${C.hull0}" opacity="0.3"/>
    <rect x="14" y="13" width="6" height="7" rx="0.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.4"/>
  </g>
  <!-- recoil brace -->
  <rect x="18" y="22" width="12" height="3" fill="${C.brass}" opacity="0.7"/>
  <circle cx="24" cy="16" r="2" fill="${C.ice}" opacity="0.5"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-drone.svg",
    unitSvg(
      36,
      28,
      `
  <ellipse cx="18" cy="25" rx="8" ry="2" fill="${C.shadow}"/>
  <!-- body -->
  <ellipse cx="18" cy="14" rx="8" ry="5" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <ellipse cx="18" cy="13" rx="5" ry="3" fill="${C.hull3}"/>
  <!-- sensor eye -->
  <circle cx="18" cy="13" r="2.5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.8"/>
  <circle cx="18" cy="13" r="1.2" fill="url(#coreG)" filter="url(#softGlow)"/>
  <!-- rotors -->
  <ellipse cx="6" cy="10" rx="5" ry="1.5" fill="${C.steelDim}" opacity="0.5"/>
  <ellipse cx="30" cy="10" rx="5" ry="1.5" fill="${C.steelDim}" opacity="0.5"/>
  <line x1="6" y1="10" x2="12" y2="13" stroke="${C.steel}" stroke-width="1"/>
  <line x1="30" y1="10" x2="24" y2="13" stroke="${C.steel}" stroke-width="1"/>
  <circle cx="6" cy="10" r="1.5" fill="${C.hull2}" stroke="${C.brass}" stroke-width="0.4"/>
  <circle cx="30" cy="10" r="1.5" fill="${C.hull2}" stroke="${C.brass}" stroke-width="0.4"/>
  <!-- thruster glow -->
  <ellipse cx="18" cy="20" rx="3" ry="1.5" fill="${C.ice}" opacity="0.5" filter="url(#softGlow)"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-dropship.svg",
    unitSvg(
      56,
      36,
      `
  <ellipse cx="28" cy="32" rx="18" ry="2.5" fill="${C.shadow}"/>
  <!-- fuselage -->
  <path d="M4 20 L10 12 L28 8 L48 12 L52 18 L48 24 L28 28 L10 24 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.9"/>
  <path d="M10 12 L28 8 L48 12 L28 16 Z" fill="${C.hull3}"/>
${panelLines(12, 14, 32, 10, 5)}
  <!-- cockpit -->
  <path d="M4 20 L8 14 L14 12 L14 22 L8 24 Z" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.7"/>
  <path d="M6 18 L10 15 L12 16 L8 20 Z" fill="${C.ice}" opacity="0.4"/>
  <!-- wings / thrusters -->
  <path d="M20 22 L16 30 L22 28 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <path d="M36 22 L40 30 L34 28 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <ellipse cx="18" cy="28" rx="3" ry="1.5" fill="${C.ice}" opacity="0.5"/>
  <ellipse cx="38" cy="28" rx="3" ry="1.5" fill="${C.ice}" opacity="0.5"/>
  <!-- troop bay doors -->
  <rect x="22" y="18" width="12" height="5" rx="0.5" fill="${C.hull0}" stroke="${C.brass}" stroke-width="0.5"/>
  <line x1="28" y1="18" x2="28" y2="23" stroke="${C.brass}" stroke-width="0.4"/>
  <!-- engine glow -->
  <ellipse cx="50" cy="18" rx="3" ry="2.5" fill="${C.ice}" opacity="0.6" filter="url(#softGlow)"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-gunship.svg",
    unitSvg(
      52,
      32,
      `
  <ellipse cx="26" cy="29" rx="14" ry="2" fill="${C.shadow}"/>
  <!-- fuselage -->
  <path d="M4 16 L12 10 L30 8 L44 12 L48 16 L44 20 L28 24 L10 20 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M12 10 L30 8 L44 12 L28 14 Z" fill="${C.hull3}"/>
  <!-- cockpit canopy -->
  <path d="M4 16 L8 11 L16 10 L16 18 L8 20 Z" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.7"/>
  <path d="M6 15 L10 12 L14 12 L10 17 Z" fill="${C.ice}" opacity="0.35"/>
  <!-- stub wings + hardpoints -->
  <path d="M22 18 L18 26 L28 22 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <path d="M34 16 L38 24 L32 20 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <rect x="20" y="22" width="6" height="2" fill="${C.brass}" opacity="0.7"/>
  <!-- chin gun -->
  <rect x="10" y="18" width="10" height="1.5" rx="0.3" fill="url(#steelL)"/>
  <circle cx="10" cy="18.75" r="1" fill="${C.ice}" opacity="0.7"/>
  <!-- engine -->
  <ellipse cx="46" cy="16" rx="3" ry="2.5" fill="${C.ice}" opacity="0.55" filter="url(#softGlow)"/>
  <rect x="42" y="13" width="5" height="6" rx="1" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.4"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-walker.svg",
    unitSvg(
      48,
      48,
      `
  <ellipse cx="24" cy="45" rx="14" ry="2.5" fill="${C.shadow}"/>
  <!-- heavy legs -->
  <path d="M10 26 L4 44 L12 44 L16 28 Z" fill="${C.hull1}" stroke="${C.steel}" stroke-width="0.7"/>
  <path d="M28 26 L26 44 L38 44 L36 28 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.7"/>
  <!-- knee armor -->
  <ellipse cx="10" cy="36" rx="4" ry="3" fill="${C.hull3}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <ellipse cx="32" cy="36" rx="4" ry="3" fill="${C.hull3}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <!-- body -->
  <path d="M10 10 L10 28 L22 34 L36 28 L36 10 L22 4 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="1"/>
  <path d="M10 10 L22 4 L36 10 L22 16 Z" fill="${C.hull3}"/>
${panelLines(12, 12, 22, 14, 3)}
  <!-- heavy cockpit -->
  <ellipse cx="22" cy="16" rx="6" ry="5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="1.1"/>
  <ellipse cx="22" cy="15" rx="3.5" ry="2.8" fill="url(#coreG)" opacity="0.8"/>
  <!-- shoulder cannons -->
  <rect x="4" y="10" width="8" height="4" rx="0.5" fill="url(#steelL)"/>
  <rect x="34" y="10" width="8" height="4" rx="0.5" fill="url(#steelL)"/>
  <circle cx="4" cy="12" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="42" cy="12" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <circle cx="10" cy="10" r="2.5" fill="url(#brassL)"/>
  <circle cx="36" cy="10" r="2.5" fill="url(#brassL)"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-stealth.svg",
    unitSvg(
      40,
      28,
      `
  <ellipse cx="20" cy="25" rx="10" ry="2" fill="${C.shadow}" opacity="0.5"/>
  <!-- angular stealth hull -->
  <path d="M4 16 L14 8 L28 6 L36 12 L32 20 L18 22 L8 20 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.7"/>
  <path d="M14 8 L28 6 L36 12 L24 12 Z" fill="${C.hull2}"/>
  <!-- dark coating panels -->
  <path d="M10 14 L16 10 L24 10 L20 16 Z" fill="${C.hull0}" opacity="0.6"/>
  <!-- cockpit slit -->
  <rect x="12" y="12" width="8" height="1.5" rx="0.3" fill="${C.ice}" opacity="0.5"/>
  <!-- engine -->
  <path d="M32 14 L38 14 L36 18 L30 18 Z" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.4"/>
  <ellipse cx="36" cy="16" rx="2" ry="1.5" fill="${C.ice}" opacity="0.4"/>
  <!-- subtle brass edge -->
  <line x1="8" y1="18" x2="28" y2="18" stroke="${C.brass}" stroke-width="0.4" opacity="0.4"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-rail-tank.svg",
    unitSvg(
      48,
      32,
      `
  <ellipse cx="24" cy="29" rx="16" ry="2.5" fill="${C.shadow}"/>
  <!-- tracks -->
  <rect x="4" y="22" width="40" height="6" rx="2" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.5"/>
  <rect x="6" y="23" width="3" height="4" fill="${C.hull4}"/>
  <rect x="12" y="23" width="3" height="4" fill="${C.hull4}"/>
  <rect x="33" y="23" width="3" height="4" fill="${C.hull4}"/>
  <rect x="39" y="23" width="3" height="4" fill="${C.hull4}"/>
  <!-- hull -->
  <path d="M6 22 L8 14 L24 10 L40 14 L42 22 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M8 14 L24 10 L40 14 L24 16 Z" fill="${C.hull3}"/>
  <!-- railgun barrel -->
  <rect x="20" y="6" width="24" height="3.5" rx="0.5" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.4"/>
  <rect x="20" y="7" width="24" height="1" fill="${C.hull0}" opacity="0.35"/>
  <rect x="18" y="5" width="6" height="5.5" rx="0.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.4"/>
  <circle cx="44" cy="7.75" r="1.5" fill="${C.ice}" filter="url(#softGlow)"/>
  <!-- capacitors -->
  <rect x="12" y="16" width="4" height="4" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.5"/>
  <rect x="13" y="17" width="2" height="2" fill="${C.ice}" opacity="0.5"/>
  <line x1="10" y1="20" x2="38" y2="20" stroke="${C.brass}" stroke-width="0.6" opacity="0.6"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-submarine.svg",
    unitSvg(
      56,
      28,
      `
  <ellipse cx="28" cy="24" rx="20" ry="2.5" fill="${C.shadow}" opacity="0.4"/>
  <!-- hull -->
  <ellipse cx="28" cy="16" rx="22" ry="7" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <ellipse cx="28" cy="14" rx="18" ry="4" fill="${C.hull3}" opacity="0.5"/>
  <!-- bow -->
  <path d="M6 16 L2 16 L8 12 L8 20 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.4"/>
  <!-- sail / conning tower -->
  <path d="M24 10 L24 4 L32 4 L34 10 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.6"/>
  <rect x="26" y="2" width="2" height="4" fill="${C.steel}"/>
  <circle cx="27" cy="2" r="1" fill="${C.ice}"/>
  <!-- torpedo tubes -->
  <circle cx="10" cy="14" r="1.2" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.4"/>
  <circle cx="10" cy="18" r="1.2" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.4"/>
  <!-- prop wash -->
  <ellipse cx="50" cy="16" rx="3" ry="2" fill="${C.ice}" opacity="0.3"/>
  <line x1="16" y1="20" x2="40" y2="20" stroke="${C.brass}" stroke-width="0.5" opacity="0.5"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-destroyer.svg",
    unitSvg(
      64,
      32,
      `
  <ellipse cx="32" cy="28" rx="24" ry="2.5" fill="${C.shadow}" opacity="0.4"/>
  <!-- waterline hull -->
  <path d="M2 22 L8 16 L56 16 L62 22 L56 26 L8 26 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M8 16 L56 16 L52 20 L12 20 Z" fill="${C.hull3}"/>
  <!-- superstructure -->
  <path d="M20 16 L20 8 L36 6 L42 10 L42 16 Z" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.6"/>
  <path d="M20 8 L36 6 L42 10 L28 10 Z" fill="${C.hull3}"/>
  <!-- bridge -->
  <rect x="26" y="4" width="10" height="5" rx="0.5" fill="${C.hull1}" stroke="${C.ice}" stroke-width="0.5"/>
  <rect x="28" y="5" width="6" height="2" fill="${C.ice}" opacity="0.4"/>
  <!-- gun turrets -->
  <rect x="10" y="12" width="8" height="3" rx="0.5" fill="url(#steelL)"/>
  <rect x="48" y="12" width="8" height="3" rx="0.5" fill="url(#steelL)"/>
  <circle cx="10" cy="13.5" r="1" fill="${C.ice}" opacity="0.6"/>
  <circle cx="56" cy="13.5" r="1" fill="${C.ice}" opacity="0.6"/>
  <!-- mast -->
  <line x1="32" y1="6" x2="32" y2="0" stroke="${C.steel}" stroke-width="1"/>
  <circle cx="32" cy="0" r="1.2" fill="${C.ice}"/>
  <line x1="14" y1="24" x2="50" y2="24" stroke="${C.brass}" stroke-width="0.5" opacity="0.5"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-hydrofoil.svg",
    unitSvg(
      48,
      28,
      `
  <ellipse cx="24" cy="25" rx="14" ry="2" fill="${C.shadow}" opacity="0.35"/>
  <!-- hull -->
  <path d="M4 16 L12 10 L36 10 L44 16 L40 20 L8 20 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <path d="M12 10 L36 10 L34 14 L14 14 Z" fill="${C.hull3}"/>
  <!-- foils -->
  <path d="M12 20 L8 26 L16 22 Z" fill="${C.steelDim}" stroke="${C.steel}" stroke-width="0.4"/>
  <path d="M36 20 L40 26 L32 22 Z" fill="${C.steelDim}" stroke="${C.steel}" stroke-width="0.4"/>
  <!-- cockpit -->
  <ellipse cx="18" cy="12" rx="4" ry="2.5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.5"/>
  <ellipse cx="18" cy="11.5" rx="2" ry="1.2" fill="${C.ice}" opacity="0.4"/>
  <!-- missile racks -->
  <rect x="28" y="12" width="10" height="2" fill="${C.hull2}" stroke="${C.brass}" stroke-width="0.3"/>
  <!-- wake glow -->
  <ellipse cx="42" cy="16" rx="3" ry="1.5" fill="${C.ice}" opacity="0.4"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-ew-drone.svg",
    unitSvg(
      36,
      28,
      `
  <ellipse cx="18" cy="25" rx="8" ry="2" fill="${C.shadow}"/>
  <!-- body -->
  <ellipse cx="18" cy="14" rx="7" ry="5" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <!-- dish -->
  <ellipse cx="18" cy="10" rx="8" ry="3.5" fill="none" stroke="${C.ice}" stroke-width="1" opacity="0.7"/>
  <ellipse cx="18" cy="10" rx="5" ry="2" fill="none" stroke="${C.iceLite}" stroke-width="0.5" opacity="0.5"/>
  <circle cx="18" cy="10" r="2" fill="url(#coreG)" filter="url(#softGlow)"/>
  <!-- wings -->
  <path d="M8 14 L2 18 L8 18 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.3"/>
  <path d="M28 14 L34 18 L28 18 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.3"/>
  <!-- antenna array -->
  <line x1="14" y1="8" x2="10" y2="2" stroke="${C.steel}" stroke-width="0.8"/>
  <line x1="22" y1="8" x2="26" y2="2" stroke="${C.steel}" stroke-width="0.8"/>
  <circle cx="10" cy="2" r="1" fill="${C.ice}"/>
  <circle cx="26" cy="2" r="1" fill="${C.ice}"/>
  <ellipse cx="18" cy="20" rx="2.5" ry="1" fill="${C.ice}" opacity="0.4"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-orbital.svg",
    unitSvg(
      40,
      40,
      `
  <ellipse cx="20" cy="36" rx="8" ry="2" fill="${C.shadow}" opacity="0.3"/>
  <!-- satellite body -->
  <rect x="14" y="12" width="12" height="16" rx="1" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <rect x="15" y="13" width="4" height="14" fill="${C.hull1}" opacity="0.4"/>
  <!-- solar panels -->
  <path d="M2 16 L14 14 L14 26 L2 24 Z" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.6"/>
  <path d="M38 16 L26 14 L26 26 L38 24 Z" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.6"/>
  <line x1="5" y1="18" x2="12" y2="17" stroke="${C.ice}" stroke-width="0.3" opacity="0.5"/>
  <line x1="5" y1="22" x2="12" y2="21" stroke="${C.ice}" stroke-width="0.3" opacity="0.5"/>
  <line x1="28" y1="17" x2="35" y2="18" stroke="${C.ice}" stroke-width="0.3" opacity="0.5"/>
  <line x1="28" y1="21" x2="35" y2="22" stroke="${C.ice}" stroke-width="0.3" opacity="0.5"/>
  <!-- emitter -->
  <circle cx="20" cy="10" r="3" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.8"/>
  <circle cx="20" cy="10" r="1.5" fill="url(#coreG)" filter="url(#softGlow)"/>
  <line x1="20" y1="7" x2="20" y2="2" stroke="${C.ice}" stroke-width="1.5" opacity="0.6"/>
  <circle cx="20" cy="28" r="1.5" fill="${C.brass}"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-howitzer.svg",
    unitSvg(
      48,
      36,
      `
  <ellipse cx="24" cy="33" rx="14" ry="2.5" fill="${C.shadow}"/>
  <!-- carriage -->
  <rect x="8" y="24" width="32" height="6" rx="1.5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.5"/>
  <circle cx="12" cy="30" r="3.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.5"/>
  <circle cx="36" cy="30" r="3.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.5"/>
  <circle cx="12" cy="30" r="1.5" fill="${C.hull0}"/>
  <circle cx="36" cy="30" r="1.5" fill="${C.hull0}"/>
  <!-- gun body -->
  <path d="M14 24 L14 16 L24 12 L34 16 L34 24 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <!-- elevated barrel -->
  <g transform="rotate(-35 26 16)">
    <rect x="18" y="12" width="26" height="4.5" rx="1" fill="url(#steelL)" stroke="${C.steelDim}" stroke-width="0.4"/>
    <rect x="16" y="11" width="5" height="6.5" rx="0.5" fill="${C.hull2}" stroke="${C.steel}" stroke-width="0.4"/>
    <circle cx="44" cy="14.25" r="1.3" fill="${C.ice}" filter="url(#softGlow)"/>
  </g>
  <rect x="18" y="20" width="12" height="2" fill="${C.brass}" opacity="0.6"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-bomber.svg",
    unitSvg(
      56,
      28,
      `
  <ellipse cx="28" cy="25" rx="16" ry="2" fill="${C.shadow}" opacity="0.4"/>
  <!-- flying wing -->
  <path d="M4 16 L20 8 L40 8 L52 14 L48 20 L28 22 L8 20 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <path d="M20 8 L40 8 L36 12 L24 12 Z" fill="${C.hull3}"/>
  <!-- cockpit -->
  <ellipse cx="16" cy="14" rx="4" ry="2.5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.5"/>
  <ellipse cx="16" cy="13.5" rx="2" ry="1.2" fill="${C.ice}" opacity="0.35"/>
  <!-- engines -->
  <ellipse cx="24" cy="18" rx="3" ry="1.5" fill="${C.ice}" opacity="0.4"/>
  <ellipse cx="36" cy="18" rx="3" ry="1.5" fill="${C.ice}" opacity="0.4"/>
  <!-- bomb bay -->
  <rect x="22" y="14" width="14" height="3" rx="0.5" fill="${C.hull0}" stroke="${C.brass}" stroke-width="0.4"/>
  <!-- wing tips -->
  <path d="M4 16 L2 20 L8 18 Z" fill="${C.hull2}"/>
  <path d="M52 14 L54 18 L48 18 Z" fill="${C.hull2}"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-interceptor.svg",
    unitSvg(
      44,
      24,
      `
  <ellipse cx="22" cy="21" rx="10" ry="1.5" fill="${C.shadow}" opacity="0.35"/>
  <!-- sleek fighter -->
  <path d="M2 12 L16 6 L32 6 L42 10 L38 14 L24 16 L8 14 Z" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.7"/>
  <path d="M16 6 L32 6 L30 9 L18 9 Z" fill="${C.hull3}"/>
  <!-- canopy -->
  <ellipse cx="14" cy="10" rx="4" ry="2" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.5"/>
  <ellipse cx="14" cy="9.5" rx="2" ry="1" fill="${C.ice}" opacity="0.4"/>
  <!-- twin engines -->
  <rect x="34" y="8" width="6" height="3" rx="0.5" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.4"/>
  <rect x="34" y="12" width="6" height="2.5" rx="0.5" fill="${C.hull2}" stroke="${C.ice}" stroke-width="0.4"/>
  <ellipse cx="40" cy="9.5" rx="2" ry="1.2" fill="${C.ice}" opacity="0.6" filter="url(#softGlow)"/>
  <ellipse cx="40" cy="13.25" rx="2" ry="1" fill="${C.ice}" opacity="0.5"/>
  <!-- wing weapons -->
  <rect x="20" y="14" width="8" height="1.2" fill="${C.brass}" opacity="0.6"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-spider.svg",
    unitSvg(
      48,
      36,
      `
  <ellipse cx="24" cy="33" rx="12" ry="2" fill="${C.shadow}"/>
  <!-- legs (4 visible) -->
  <path d="M18 20 L6 8 L4 10 L16 22" fill="none" stroke="${C.steel}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M18 22 L4 28 L6 30 L18 24" fill="none" stroke="${C.steelDim}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M30 20 L42 8 L44 10 L32 22" fill="none" stroke="${C.steel}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M30 22 L44 28 L42 30 L30 24" fill="none" stroke="${C.steelDim}" stroke-width="1.8" stroke-linecap="round"/>
  <!-- joint bulbs -->
  <circle cx="6" cy="9" r="1.5" fill="${C.brass}"/>
  <circle cx="5" cy="29" r="1.5" fill="${C.brass}"/>
  <circle cx="42" cy="9" r="1.5" fill="${C.brass}"/>
  <circle cx="43" cy="29" r="1.5" fill="${C.brass}"/>
  <!-- body -->
  <ellipse cx="24" cy="20" rx="10" ry="7" fill="url(#hullL)" stroke="${C.steel}" stroke-width="0.8"/>
  <ellipse cx="24" cy="18" rx="6" ry="4" fill="${C.hull3}"/>
  <!-- sensor cluster -->
  <circle cx="24" cy="17" r="3" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.8"/>
  <circle cx="24" cy="17" r="1.5" fill="url(#coreG)" filter="url(#softGlow)"/>
  <circle cx="20" cy="19" r="1" fill="${C.ice}" opacity="0.6"/>
  <circle cx="28" cy="19" r="1" fill="${C.ice}" opacity="0.6"/>
`,
    ),
  ),
);

written.push(
  write(
    "units/unit-commando.svg",
    unitSvg(
      32,
      40,
      `
  <ellipse cx="16" cy="37" rx="7" ry="2" fill="${C.shadow}"/>
  <!-- legs -->
  <path d="M11 28 L10 36 L13 36 L14 28 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.3"/>
  <path d="M18 28 L17 36 L20 36 L21 28 Z" fill="${C.hull2}" stroke="${C.steelDim}" stroke-width="0.3"/>
  <!-- body - darker stealth armor -->
  <path d="M10 16 L10 28 L16 30 L22 28 L22 16 L16 14 Z" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.6"/>
  <path d="M10 16 L16 14 L22 16 L16 19 Z" fill="${C.hull2}"/>
  <!-- cyber pack -->
  <rect x="20" y="18" width="5" height="8" rx="0.5" fill="${C.hull0}" stroke="${C.ice}" stroke-width="0.5"/>
  <rect x="21" y="19" width="3" height="1.5" fill="${C.ice}" opacity="0.5"/>
  <rect x="21" y="22" width="3" height="1.5" fill="${C.ice}" opacity="0.4"/>
  <!-- helmet visor -->
  <ellipse cx="16" cy="11" rx="4.5" ry="5" fill="${C.hull1}" stroke="${C.steelDim}" stroke-width="0.5"/>
  <rect x="13" y="9" width="6" height="2.5" rx="0.5" fill="${C.ice}" opacity="0.7"/>
  <!-- SMG -->
  <rect x="22" y="20" width="7" height="1.2" rx="0.3" fill="${C.steel}"/>
  <!-- shoulder -->
  <ellipse cx="10" cy="17" rx="2" ry="1.5" fill="${C.hull3}" stroke="${C.brass}" stroke-width="0.3"/>
`,
    ),
  ),
);

// ═══════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════

written.push(
  write(
    "effects/fx-laser.svg",
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 8" width="48" height="8" fill="none">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a8d4e0" stop-opacity="0.2"/>
      <stop offset="30%" stop-color="#7eb6c9"/>
      <stop offset="70%" stop-color="#d4eef5"/>
      <stop offset="100%" stop-color="#7eb6c9" stop-opacity="0.3"/>
    </linearGradient>
    <filter id="g"><feGaussianBlur stdDeviation="1"/></filter>
  </defs>
  <rect x="0" y="2" width="48" height="4" rx="2" fill="#7eb6c9" opacity="0.25" filter="url(#g)"/>
  <rect x="0" y="3" width="48" height="2" rx="1" fill="url(#lg)"/>
  <rect x="0" y="3.5" width="48" height="1" fill="#d4eef5" opacity="0.9"/>
  <circle cx="2" cy="4" r="2.5" fill="#a8d4e0" opacity="0.7"/>
  <circle cx="46" cy="4" r="2" fill="#d4eef5" opacity="0.8"/>
</svg>
`,
  ),
);

written.push(
  write(
    "effects/fx-plasma.svg",
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
  <defs>
    <radialGradient id="pg" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#d4eef5"/>
      <stop offset="40%" stop-color="#7eb6c9"/>
      <stop offset="100%" stop-color="#1a4050" stop-opacity="0"/>
    </radialGradient>
    <filter id="g"><feGaussianBlur stdDeviation="1.5"/></filter>
  </defs>
  <circle cx="16" cy="16" r="14" fill="#7eb6c9" opacity="0.15" filter="url(#g)"/>
  <circle cx="16" cy="16" r="10" fill="url(#pg)" opacity="0.85"/>
  <circle cx="16" cy="16" r="6" fill="#a8d4e0" opacity="0.7"/>
  <circle cx="14" cy="13" r="3" fill="#d4eef5" opacity="0.9"/>
  <ellipse cx="16" cy="16" rx="12" ry="4" fill="none" stroke="#7eb6c9" stroke-width="0.8" opacity="0.4" transform="rotate(30 16 16)"/>
  <ellipse cx="16" cy="16" rx="12" ry="4" fill="none" stroke="#a8d4e0" stroke-width="0.5" opacity="0.3" transform="rotate(-40 16 16)"/>
</svg>
`,
  ),
);

written.push(
  write(
    "effects/fx-explosion.svg",
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
  <defs>
    <radialGradient id="exOuter" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e0c9a0" stop-opacity="0.9"/>
      <stop offset="40%" stop-color="#c4a574" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#8a5030" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="exMid" cx="45%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#fff8e8"/>
      <stop offset="50%" stop-color="#e8d4a8"/>
      <stop offset="100%" stop-color="#c47850" stop-opacity="0"/>
    </radialGradient>
    <filter id="g"><feGaussianBlur stdDeviation="1.2"/></filter>
  </defs>
  <!-- outer blast -->
  <circle cx="24" cy="24" r="20" fill="url(#exOuter)" opacity="0.5" filter="url(#g)"/>
  <!-- jagged fire tendrils -->
  <path d="M24 6 L28 16 L38 10 L32 20 L44 22 L32 26 L40 36 L28 30 L26 42 L22 30 L12 38 L18 26 L6 24 L18 20 L10 10 L22 16 Z" fill="#c4a574" opacity="0.55"/>
  <path d="M24 10 L27 18 L34 14 L30 20 L40 22 L30 25 L34 32 L27 28 L25 38 L22 28 L16 34 L20 25 L10 22 L20 20 L14 12 L22 18 Z" fill="#e8d4a8" opacity="0.7"/>
  <!-- mid core -->
  <circle cx="24" cy="24" r="10" fill="url(#exMid)" opacity="0.85"/>
  <circle cx="24" cy="24" r="5" fill="#fff8e8" opacity="0.95"/>
  <circle cx="22" cy="22" r="2.5" fill="#ffffff" opacity="0.9"/>
  <!-- debris sparks -->
  <circle cx="8" cy="14" r="1.2" fill="#e0c9a0" opacity="0.7"/>
  <circle cx="40" cy="12" r="1" fill="#c4a574" opacity="0.6"/>
  <circle cx="38" cy="36" r="1.3" fill="#e8d4a8" opacity="0.7"/>
  <circle cx="10" cy="34" r="0.9" fill="#c4a574" opacity="0.6"/>
</svg>
`,
  ),
);

written.push(
  write(
    "effects/fx-emp.svg",
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
  <defs>
    <radialGradient id="eg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#a8d4e0" stop-opacity="0.6"/>
      <stop offset="60%" stop-color="#7eb6c9" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#7eb6c9" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="24" cy="24" r="22" fill="url(#eg)"/>
  <circle cx="24" cy="24" r="18" fill="none" stroke="#7eb6c9" stroke-width="1.5" opacity="0.5"/>
  <circle cx="24" cy="24" r="12" fill="none" stroke="#a8d4e0" stroke-width="1.2" opacity="0.6"/>
  <circle cx="24" cy="24" r="6" fill="none" stroke="#d4eef5" stroke-width="1" opacity="0.7"/>
  <circle cx="24" cy="24" r="2.5" fill="#d4eef5" opacity="0.9"/>
  <!-- lightning arcs -->
  <path d="M24 6 L22 14 L28 16 L20 24" stroke="#a8d4e0" stroke-width="1" fill="none" opacity="0.7"/>
  <path d="M42 24 L34 22 L32 28 L24 26" stroke="#7eb6c9" stroke-width="1" fill="none" opacity="0.6"/>
  <path d="M24 42 L26 34 L20 32 L28 24" stroke="#a8d4e0" stroke-width="1" fill="none" opacity="0.7"/>
  <path d="M6 24 L14 26 L16 20 L24 22" stroke="#7eb6c9" stroke-width="1" fill="none" opacity="0.6"/>
</svg>
`,
  ),
);

written.push(
  write(
    "effects/fx-shield-hit.svg",
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40" fill="none">
  <defs>
    <radialGradient id="sg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#a8d4e0" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#7eb6c9" stop-opacity="0"/>
    </radialGradient>
    <filter id="g"><feGaussianBlur stdDeviation="1"/></filter>
  </defs>
  <ellipse cx="20" cy="20" rx="16" ry="14" fill="url(#sg)" opacity="0.4"/>
  <path d="M8 20 Q8 6 20 4 Q32 6 32 20 Q32 34 20 36 Q8 34 8 20" fill="none" stroke="#7eb6c9" stroke-width="2" opacity="0.6"/>
  <path d="M10 20 Q10 8 20 6 Q30 8 30 20" fill="none" stroke="#a8d4e0" stroke-width="1.2" opacity="0.5"/>
  <!-- impact flash -->
  <circle cx="26" cy="14" r="5" fill="#d4eef5" opacity="0.7" filter="url(#g)"/>
  <circle cx="26" cy="14" r="2.5" fill="#ffffff" opacity="0.85"/>
  <!-- hex crack lines -->
  <path d="M26 14 L30 10 M26 14 L32 16 M26 14 L28 20" stroke="#a8d4e0" stroke-width="0.8" opacity="0.6"/>
</svg>
`,
  ),
);

written.push(
  write(
    "effects/fx-muzzle.svg",
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">
  <defs>
    <radialGradient id="mg" cx="40%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="30%" stop-color="#d4eef5"/>
      <stop offset="70%" stop-color="#7eb6c9" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#7eb6c9" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="12" cy="12" r="10" fill="url(#mg)" opacity="0.8"/>
  <circle cx="12" cy="12" r="5" fill="#a8d4e0" opacity="0.7"/>
  <circle cx="11" cy="11" r="2.5" fill="#ffffff" opacity="0.95"/>
  <!-- flash spikes -->
  <path d="M12 2 L13.5 9 L12 8 L10.5 9 Z" fill="#d4eef5" opacity="0.8"/>
  <path d="M12 22 L13.5 15 L12 16 L10.5 15 Z" fill="#d4eef5" opacity="0.8"/>
  <path d="M2 12 L9 13.5 L8 12 L9 10.5 Z" fill="#a8d4e0" opacity="0.7"/>
  <path d="M22 12 L15 13.5 L16 12 L15 10.5 Z" fill="#a8d4e0" opacity="0.7"/>
</svg>
`,
  ),
);

written.push(
  write(
    "effects/fx-wreck.svg",
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28" width="40" height="28" fill="none">
  <defs>
    <linearGradient id="wk" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1c2733"/>
      <stop offset="100%" stop-color="#0a0e14"/>
    </linearGradient>
  </defs>
  <ellipse cx="20" cy="24" rx="14" ry="3" fill="rgba(0,0,0,0.5)"/>
  <!-- broken hull silhouette -->
  <path d="M4 18 L8 10 L16 8 L22 12 L20 8 L28 6 L36 12 L34 18 L38 20 L30 22 L18 24 L10 22 L2 20 Z" fill="url(#wk)" stroke="#2a3848" stroke-width="0.7"/>
  <!-- scorched panels -->
  <path d="M10 14 L14 11 L18 14 L14 16 Z" fill="#121820" opacity="0.8"/>
  <path d="M24 12 L30 10 L32 14 L26 16 Z" fill="#121820" opacity="0.7"/>
  <!-- jagged break -->
  <path d="M18 10 L20 16 L16 18 L22 20" stroke="#3d4a5a" stroke-width="0.8" fill="none"/>
  <!-- ember glow -->
  <circle cx="14" cy="16" r="1.5" fill="#c4a574" opacity="0.4"/>
  <circle cx="28" cy="14" r="1" fill="#c47850" opacity="0.35"/>
  <!-- bent antenna -->
  <path d="M26 8 L30 2 L28 4" stroke="#5c6b7e" stroke-width="1" fill="none"/>
</svg>
`,
  ),
);

console.log(`Wrote ${written.length} sprite files:`);
for (const w of written) console.log(`  ${w}`);
