#!/usr/bin/env node
/**
 * Realistic late-22nd-century military sprites (SVG).
 * Grounded proportions, metal shading, panel lines, weathering, ground shadows.
 * Run: node scripts/gen-realistic-sprites.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sprites");

const DEFS = `
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#9aa7b4"/>
    <stop offset="35%" stop-color="#6a7684"/>
    <stop offset="70%" stop-color="#3e4854"/>
    <stop offset="100%" stop-color="#1c222a"/>
  </linearGradient>
  <linearGradient id="steelSide" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#2a323c"/>
    <stop offset="45%" stop-color="#5c6876"/>
    <stop offset="100%" stop-color="#1a2028"/>
  </linearGradient>
  <linearGradient id="armor" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0%" stop-color="#5a6a58"/>
    <stop offset="40%" stop-color="#3a4638"/>
    <stop offset="100%" stop-color="#1e261c"/>
  </linearGradient>
  <linearGradient id="camo" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#4a5640"/>
    <stop offset="50%" stop-color="#2e382c"/>
    <stop offset="100%" stop-color="#1a2218"/>
  </linearGradient>
  <linearGradient id="desert" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#8a7a5a"/>
    <stop offset="100%" stop-color="#4a4030"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#a8d0e0" stop-opacity="0.85"/>
    <stop offset="55%" stop-color="#2a5060" stop-opacity="0.9"/>
    <stop offset="100%" stop-color="#0a1820"/>
  </linearGradient>
  <linearGradient id="heat" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%" stop-color="#ff6a20" stop-opacity="0.9"/>
    <stop offset="50%" stop-color="#ffc060" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#fff0c0" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="muzzle" x1="0" y1="0.5" x2="1" y2="0.5">
    <stop offset="0%" stop-color="#fff8e0"/>
    <stop offset="40%" stop-color="#ffb040"/>
    <stop offset="100%" stop-color="#ff6020" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#000" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="0.6"/>
  </filter>
`;

function svg(w, h, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none">
  <defs>${DEFS}</defs>
${body}
</svg>
`;
}

function write(rel, content) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function shadow(cx, cy, rx, ry = rx * 0.28) {
  return `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#shadow)"/>`;
}

function panel(x, y, w, h, n = 3) {
  let s = "";
  for (let i = 1; i < n; i++) {
    const px = x + (w * i) / n;
    s += `  <line x1="${px}" y1="${y + 1}" x2="${px}" y2="${y + h - 1}" stroke="#0e1218" stroke-width="0.4" opacity="0.55"/>\n`;
  }
  s += `  <line x1="${x + 1}" y1="${y + h * 0.45}" x2="${x + w - 1}" y2="${y + h * 0.45}" stroke="#8a96a4" stroke-width="0.3" opacity="0.25"/>\n`;
  return s;
}

function rivets(points) {
  return points
    .map(
      ([x, y]) =>
        `  <circle cx="${x}" cy="${y}" r="0.7" fill="#1a2028" stroke="#6a7684" stroke-width="0.3"/>`,
    )
    .join("\n");
}

function weather(x, y, w, h) {
  return `  <path d="M${x + 2} ${y + h * 0.7} L${x + w * 0.4} ${y + h * 0.75} L${x + w * 0.7} ${y + h * 0.68}" stroke="#1a2218" stroke-width="1.2" opacity="0.35" stroke-linecap="round"/>
  <path d="M${x + w * 0.2} ${y + h * 0.3} L${x + w * 0.55} ${y + h * 0.28}" stroke="#8a96a4" stroke-width="0.4" opacity="0.2"/>`;
}

// ─── UNITS ─────────────────────────────────────────────────

write(
  "units/unit-trooper.svg",
  svg(
    64,
    64,
    `${shadow(32, 58, 14)}
  <!-- boots -->
  <path d="M22 50 L20 57 L28 57 L29 50 Z" fill="#1a1e24" stroke="#3a424c" stroke-width="0.5"/>
  <path d="M35 50 L34 57 L42 57 L40 50 Z" fill="#222830" stroke="#3a424c" stroke-width="0.5"/>
  <!-- legs / exo actuators -->
  <path d="M24 36 L22 50 L29 50 L30 36 Z" fill="url(#armor)" stroke="#2a3228" stroke-width="0.6"/>
  <path d="M34 36 L35 50 L42 50 L40 36 Z" fill="url(#camo)" stroke="#2a3228" stroke-width="0.6"/>
  <rect x="25" y="40" width="3" height="8" rx="0.5" fill="#5c6876"/>
  <rect x="37" y="40" width="3" height="8" rx="0.5" fill="#5c6876"/>
  <!-- hip plate -->
  <path d="M22 34 L32 37 L42 34 L40 38 L32 40 L24 38 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.5"/>
  <!-- torso armor -->
  <path d="M23 18 L23 35 L32 38 L41 35 L41 18 L32 15 Z" fill="url(#camo)" stroke="#1a2218" stroke-width="0.7"/>
  ${panel(24, 18, 16, 16, 3)}
  ${weather(23, 18, 18, 17)}
  <!-- chest plate -->
  <path d="M27 20 L32 18 L37 20 L37 28 L32 30 L27 28 Z" fill="url(#steel)" stroke="#0e1218" stroke-width="0.5"/>
  <rect x="30" y="22" width="4" height="5" rx="0.4" fill="#1a3040" stroke="#4a8090" stroke-width="0.4"/>
  <!-- arms -->
  <path d="M18 20 L14 32 L19 34 L23 22 Z" fill="url(#armor)" stroke="#1a2218" stroke-width="0.5"/>
  <path d="M41 20 L46 21 L48 34 L42 33 Z" fill="url(#armor)" stroke="#1a2218" stroke-width="0.5"/>
  <!-- rifle -->
  <rect x="46" y="28" width="14" height="2.2" rx="0.4" fill="#2a3038" stroke="#5c6876" stroke-width="0.4"/>
  <rect x="58" y="27.2" width="4" height="1.2" fill="#1a1e24"/>
  <rect x="47" y="30" width="3" height="4" fill="#3a424c"/>
  <!-- helmet -->
  <path d="M26 10 L32 7 L38 10 L39 17 L32 19 L25 17 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.6"/>
  <path d="M27 13 L32 12 L37 13 L36 16 L32 17 L28 16 Z" fill="url(#glass)"/>
  <line x1="32" y1="7" x2="32" y2="4" stroke="#6a7684" stroke-width="0.8"/>
  <circle cx="32" cy="3.5" r="1.1" fill="#3a8090" stroke="#7eb6c9" stroke-width="0.3"/>
  ${rivets([[25, 22], [39, 22], [28, 32], [36, 32]])}`,
  ),
);

write(
  "units/unit-mech.svg",
  svg(
    96,
    96,
    `${shadow(48, 90, 28, 6)}
  <!-- feet -->
  <path d="M28 78 L22 88 L40 88 L42 78 Z" fill="#1a1e24" stroke="#4a5460" stroke-width="0.7"/>
  <path d="M54 78 L56 88 L74 88 L68 78 Z" fill="#222830" stroke="#4a5460" stroke-width="0.7"/>
  <!-- lower legs -->
  <path d="M30 58 L28 78 L42 78 L44 58 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.8"/>
  <path d="M52 58 L54 78 L68 78 L66 58 Z" fill="url(#steelSide)" stroke="#1a2028" stroke-width="0.8"/>
  ${panel(31, 60, 11, 16, 2)}
  ${panel(55, 60, 11, 16, 2)}
  <!-- knee actuators -->
  <circle cx="36" cy="58" r="4" fill="#3a424c" stroke="#6a7684" stroke-width="0.6"/>
  <circle cx="60" cy="58" r="4" fill="#3a424c" stroke="#6a7684" stroke-width="0.6"/>
  <!-- thighs -->
  <path d="M32 40 L30 58 L44 58 L46 42 Z" fill="url(#armor)" stroke="#1a2218" stroke-width="0.7"/>
  <path d="M50 42 L52 58 L66 58 L64 40 Z" fill="url(#camo)" stroke="#1a2218" stroke-width="0.7"/>
  <!-- pelvis -->
  <path d="M34 36 L48 40 L62 36 L60 44 L48 48 L36 44 Z" fill="url(#steel)" stroke="#0e1218" stroke-width="0.7"/>
  <!-- torso -->
  <path d="M30 14 L30 38 L48 44 L66 38 L66 14 L48 8 Z" fill="url(#camo)" stroke="#0e1218" stroke-width="1"/>
  ${panel(32, 14, 32, 24, 4)}
  ${weather(30, 14, 36, 28)}
  <!-- cockpit -->
  <path d="M40 12 L48 9 L56 12 L55 22 L48 24 L41 22 Z" fill="url(#glass)" stroke="#1a3040" stroke-width="0.6"/>
  <!-- shoulder pods -->
  <path d="M18 16 L30 14 L30 28 L16 30 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.7"/>
  <path d="M66 14 L78 16 L80 30 L66 28 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.7"/>
  <!-- arm cannons -->
  <rect x="8" y="28" width="14" height="5" rx="1" fill="#2a3038" stroke="#5c6876" stroke-width="0.5"/>
  <rect x="4" y="29" width="5" height="3" fill="#1a1e24"/>
  <rect x="74" y="28" width="14" height="5" rx="1" fill="#2a3038" stroke="#5c6876" stroke-width="0.5"/>
  <rect x="87" y="29" width="5" height="3" fill="#1a1e24"/>
  <!-- faction chevron -->
  <path d="M44 28 L48 26 L52 28 L48 34 Z" fill="#c4a574" opacity="0.7"/>
  ${rivets([[34, 18], [62, 18], [36, 34], [60, 34]])}`,
  ),
);

write(
  "units/unit-hover.svg",
  svg(
    96,
    64,
    `${shadow(48, 58, 36, 5)}
  <!-- thruster glow -->
  <ellipse cx="24" cy="52" rx="10" ry="3" fill="url(#heat)" opacity="0.7"/>
  <ellipse cx="72" cy="52" rx="10" ry="3" fill="url(#heat)" opacity="0.7"/>
  <!-- skirt -->
  <path d="M12 40 L20 48 L76 48 L84 40 L78 36 L18 36 Z" fill="#1a2028" stroke="#3a424c" stroke-width="0.6"/>
  <!-- hull -->
  <path d="M16 22 L22 14 L74 14 L80 22 L76 38 L20 38 Z" fill="url(#armor)" stroke="#0e1218" stroke-width="0.9"/>
  ${panel(22, 16, 52, 20, 5)}
  ${weather(16, 14, 64, 24)}
  <!-- turret ring -->
  <ellipse cx="48" cy="26" rx="14" ry="8" fill="url(#steel)" stroke="#1a2028" stroke-width="0.6"/>
  <!-- cannon -->
  <rect x="48" y="22" width="36" height="5" rx="1" fill="#2a3038" stroke="#5c6876" stroke-width="0.5"/>
  <rect x="82" y="21" width="6" height="7" rx="0.5" fill="#1a1e24"/>
  <!-- optics -->
  <circle cx="42" cy="24" r="2.2" fill="url(#glass)" stroke="#4a8090" stroke-width="0.4"/>
  <!-- side skirts detail -->
  <rect x="18" y="34" width="10" height="3" fill="#2a3228"/>
  <rect x="68" y="34" width="10" height="3" fill="#2a3228"/>
  <path d="M30 18 L36 16 L42 18" stroke="#c4a574" stroke-width="1" opacity="0.5"/>
  ${rivets([[24, 20], [72, 20], [28, 34], [68, 34]])}`,
  ),
);

write(
  "units/unit-drone.svg",
  svg(
    72,
    56,
    `${shadow(36, 50, 18, 4)}
  <!-- rotor blur -->
  <ellipse cx="36" cy="14" rx="28" ry="3" fill="#4a5460" opacity="0.25"/>
  <line x1="10" y1="14" x2="62" y2="14" stroke="#8a96a4" stroke-width="0.6" opacity="0.5"/>
  <!-- body -->
  <path d="M22 20 L36 16 L50 20 L52 34 L36 40 L20 34 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.7"/>
  ${panel(24, 20, 24, 14, 3)}
  <!-- camera dome -->
  <ellipse cx="36" cy="28" rx="6" ry="5" fill="url(#glass)" stroke="#1a3040" stroke-width="0.5"/>
  <circle cx="36" cy="28" r="2" fill="#1a4050"/>
  <!-- wings / arms -->
  <path d="M20 26 L8 22 L6 28 L20 32 Z" fill="url(#armor)" stroke="#1a2218" stroke-width="0.5"/>
  <path d="M52 26 L64 22 L66 28 L52 32 Z" fill="url(#armor)" stroke="#1a2218" stroke-width="0.5"/>
  <!-- landing skids -->
  <path d="M24 38 L22 48 L28 48" stroke="#3a424c" stroke-width="1.2" fill="none"/>
  <path d="M48 38 L50 48 L44 48" stroke="#3a424c" stroke-width="1.2" fill="none"/>
  <!-- weapon pod -->
  <rect x="32" y="36" width="8" height="4" rx="0.5" fill="#2a3038"/>
  ${rivets([[26, 24], [46, 24]])}`,
  ),
);

write(
  "units/unit-siege.svg",
  svg(
    96,
    72,
    `${shadow(48, 66, 34, 5)}
  <!-- tracks -->
  <path d="M14 48 L18 60 L78 60 L82 48 L78 44 L18 44 Z" fill="#1a1e24" stroke="#3a424c" stroke-width="0.7"/>
  <g stroke="#4a5460" stroke-width="1.2">
    <line x1="22" y1="46" x2="22" y2="58"/><line x1="32" y1="46" x2="32" y2="58"/>
    <line x1="42" y1="46" x2="42" y2="58"/><line x1="52" y1="46" x2="52" y2="58"/>
    <line x1="62" y1="46" x2="62" y2="58"/><line x1="72" y1="46" x2="72" y2="58"/>
  </g>
  <!-- hull -->
  <path d="M20 28 L24 18 L72 18 L76 28 L74 46 L22 46 Z" fill="url(#desert)" stroke="#1a1810" stroke-width="0.9"/>
  ${panel(26, 20, 44, 22, 4)}
  ${weather(20, 18, 56, 28)}
  <!-- howitzer barrel -->
  <rect x="48" y="14" width="42" height="7" rx="1" fill="#2a3038" stroke="#5c6876" stroke-width="0.6"/>
  <rect x="88" y="12" width="6" height="11" rx="0.5" fill="#1a1e24"/>
  <!-- breech -->
  <rect x="36" y="12" width="16" height="12" rx="1" fill="url(#steel)" stroke="#0e1218" stroke-width="0.5"/>
  <!-- cabin -->
  <path d="M26 20 L34 16 L42 20 L40 30 L28 30 Z" fill="url(#glass)" stroke="#1a3040" stroke-width="0.5"/>
  ${rivets([[28, 24], [68, 24], [30, 40], [66, 40]])}`,
  ),
);

write(
  "units/unit-walker.svg",
  svg(
    80,
    88,
    `${shadow(40, 82, 22, 5)}
  <path d="M26 70 L22 80 L34 80 L36 70 Z" fill="#1a1e24" stroke="#3a424c" stroke-width="0.5"/>
  <path d="M44 70 L46 80 L58 80 L54 70 Z" fill="#222830" stroke="#3a424c" stroke-width="0.5"/>
  <path d="M28 48 L26 70 L36 70 L38 50 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.6"/>
  <path d="M42 50 L44 70 L54 70 L52 48 Z" fill="url(#steelSide)" stroke="#1a2028" stroke-width="0.6"/>
  <path d="M24 22 L24 50 L40 56 L56 50 L56 22 L40 16 Z" fill="url(#camo)" stroke="#0e1218" stroke-width="0.8"/>
  ${panel(26, 24, 28, 24, 3)}
  <path d="M34 20 L40 17 L46 20 L45 28 L40 30 L35 28 Z" fill="url(#glass)"/>
  <rect x="14" y="30" width="12" height="4" rx="0.5" fill="#2a3038"/>
  <rect x="54" y="30" width="12" height="4" rx="0.5" fill="#2a3038"/>
  ${weather(24, 22, 32, 28)}
  ${rivets([[28, 28], [52, 28]])}`,
  ),
);

write(
  "units/unit-rail-tank.svg",
  svg(
    96,
    64,
    `${shadow(48, 58, 36, 5)}
  <path d="M12 42 L16 54 L80 54 L84 42 L80 38 L16 38 Z" fill="#141820" stroke="#3a424c" stroke-width="0.6"/>
  <g stroke="#4a5460" stroke-width="1"><line x1="20" y1="40" x2="20" y2="52"/><line x1="30" y1="40" x2="30" y2="52"/><line x1="40" y1="40" x2="40" y2="52"/><line x1="50" y1="40" x2="50" y2="52"/><line x1="60" y1="40" x2="60" y2="52"/><line x1="70" y1="40" x2="70" y2="52"/></g>
  <path d="M18 24 L24 16 L72 16 L78 24 L74 40 L22 40 Z" fill="url(#armor)" stroke="#0e1218" stroke-width="0.8"/>
  ${panel(26, 18, 44, 18, 4)}
  <rect x="40" y="12" width="48" height="6" rx="1" fill="#3a424c" stroke="#6a7684" stroke-width="0.5"/>
  <rect x="86" y="10" width="8" height="10" fill="#1a1e24"/>
  <path d="M28 18 L36 14 L44 18 L42 26 L30 26 Z" fill="url(#glass)"/>
  ${weather(18, 16, 60, 22)}
  ${rivets([[26, 22], [70, 22]])}`,
  ),
);

write(
  "units/unit-spider.svg",
  svg(
    88,
    72,
    `${shadow(44, 66, 30, 5)}
  <!-- legs -->
  <path d="M30 40 L8 28 L6 34 L28 48 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.5"/>
  <path d="M30 44 L10 58 L16 62 L34 48 Z" fill="url(#steelSide)" stroke="#1a2028" stroke-width="0.5"/>
  <path d="M58 40 L80 28 L82 34 L60 48 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.5"/>
  <path d="M58 44 L78 58 L72 62 L54 48 Z" fill="url(#steelSide)" stroke="#1a2028" stroke-width="0.5"/>
  <path d="M40 42 L32 62 L38 64 L46 46 Z" fill="#2a3038"/>
  <path d="M48 42 L56 62 L50 64 L42 46 Z" fill="#2a3038"/>
  <!-- body -->
  <ellipse cx="44" cy="36" rx="18" ry="14" fill="url(#camo)" stroke="#0e1218" stroke-width="0.8"/>
  ${panel(32, 28, 24, 16, 3)}
  <ellipse cx="44" cy="32" rx="8" ry="6" fill="url(#glass)"/>
  <circle cx="44" cy="32" r="2.5" fill="#1a4050"/>
  ${rivets([[34, 34], [54, 34]])}`,
  ),
);

// Remaining units — detailed but compact variants
const unitTemplates = {
  "unit-bomber.svg": [88, 56, "air"],
  "unit-gunship.svg": [80, 56, "air"],
  "unit-interceptor.svg": [72, 48, "air"],
  "unit-dropship.svg": [96, 64, "air"],
  "unit-ew-drone.svg": [64, 48, "air"],
  "unit-howitzer.svg": [88, 64, "arty"],
  "unit-commando.svg": [56, 64, "inf"],
  "unit-stealth.svg": [56, 64, "inf"],
  "unit-destroyer.svg": [110, 48, "ship"],
  "unit-hydrofoil.svg": [88, 40, "ship"],
  "unit-submarine.svg": [96, 40, "ship"],
  "unit-orbital.svg": [72, 72, "orb"],
};

function unitBody(kind, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  if (kind === "air") {
    return `${shadow(cx, h - 6, w * 0.35, 3)}
  <path d="M${cx - w * 0.4} ${cy} L${cx} ${cy - h * 0.35} L${cx + w * 0.4} ${cy} L${cx} ${cy + h * 0.25} Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.7"/>
  <path d="M${cx - w * 0.35} ${cy} L${cx - w * 0.08} ${cy - 2} L${cx - w * 0.08} ${cy + 4} Z" fill="url(#armor)"/>
  <path d="M${cx + w * 0.35} ${cy} L${cx + w * 0.08} ${cy - 2} L${cx + w * 0.08} ${cy + 4} Z" fill="url(#armor)"/>
  <ellipse cx="${cx}" cy="${cy - 2}" rx="5" ry="3.5" fill="url(#glass)"/>
  <rect x="${cx - 3}" y="${cy + 4}" width="6" height="8" fill="#2a3038"/>
  ${weather(cx - w * 0.25, cy - h * 0.2, w * 0.5, h * 0.35)}`;
  }
  if (kind === "arty") {
    return `${shadow(cx, h - 6, w * 0.38, 4)}
  <path d="M${12} ${h * 0.55} L${16} ${h * 0.78} L${w - 16} ${h * 0.78} L${w - 12} ${h * 0.55} Z" fill="#141820" stroke="#3a424c" stroke-width="0.6"/>
  <path d="M${14} ${h * 0.32} L${20} ${h * 0.2} L${w - 20} ${h * 0.2} L${w - 14} ${h * 0.32} L${w - 16} ${h * 0.55} L${16} ${h * 0.55} Z" fill="url(#desert)" stroke="#1a1810" stroke-width="0.7"/>
  <rect x="${cx}" y="${h * 0.12}" width="${w * 0.4}" height="6" rx="1" fill="#2a3038" stroke="#5c6876" stroke-width="0.5"/>
  ${panel(22, h * 0.22, w - 44, h * 0.28, 3)}`;
  }
  if (kind === "inf") {
    return `${shadow(cx, h - 6, 12, 3)}
  <path d="M${cx - 8} ${h * 0.72} L${cx - 10} ${h - 6} L${cx - 2} ${h - 6} Z" fill="#1a1e24"/>
  <path d="M${cx + 2} ${h - 6} L${cx + 10} ${h - 6} L${cx + 8} ${h * 0.72} Z" fill="#222830"/>
  <path d="M${cx - 9} ${h * 0.28} L${cx - 9} ${h * 0.72} L${cx} ${h * 0.76} L${cx + 9} ${h * 0.72} L${cx + 9} ${h * 0.28} L${cx} ${h * 0.22} Z" fill="url(#camo)" stroke="#1a2218" stroke-width="0.6"/>
  <path d="M${cx - 6} ${h * 0.14} L${cx} ${h * 0.1} L${cx + 6} ${h * 0.14} L${cx + 6} ${h * 0.26} L${cx} ${h * 0.3} L${cx - 6} ${h * 0.26} Z" fill="url(#steel)"/>
  <path d="M${cx - 4} ${h * 0.18} L${cx + 4} ${h * 0.18} L${cx + 3} ${h * 0.24} L${cx - 3} ${h * 0.24} Z" fill="url(#glass)"/>
  <rect x="${cx + 8}" y="${h * 0.4}" width="14" height="2" fill="#2a3038"/>`;
  }
  if (kind === "ship") {
    return `${shadow(cx, h - 4, w * 0.42, 3)}
  <path d="M${8} ${h * 0.55} L${w * 0.15} ${h * 0.35} L${w * 0.85} ${h * 0.35} L${w - 8} ${h * 0.55} L${w * 0.85} ${h * 0.72} L${w * 0.15} ${h * 0.72} Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.7"/>
  <rect x="${w * 0.35}" y="${h * 0.18}" width="${w * 0.22}" height="${h * 0.2}" fill="url(#armor)" stroke="#0e1218" stroke-width="0.5"/>
  <rect x="${w * 0.55}" y="${h * 0.28}" width="${w * 0.28}" height="3" fill="#2a3038"/>
  ${panel(w * 0.2, h * 0.4, w * 0.55, h * 0.2, 4)}`;
  }
  // orbital
  return `${shadow(cx, h - 6, 16, 3)}
  <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.35}" ry="${h * 0.28}" fill="url(#steel)" stroke="#1a2028" stroke-width="0.7"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.18}" ry="${h * 0.14}" fill="url(#glass)"/>
  <rect x="${cx - 2}" y="${cy + h * 0.2}" width="4" height="${h * 0.25}" fill="url(#heat)"/>
  ${panel(cx - w * 0.25, cy - h * 0.15, w * 0.5, h * 0.3, 3)}`;
}

for (const [file, [w, h, kind]] of Object.entries(unitTemplates)) {
  write(`units/${file}`, svg(w, h, unitBody(kind, w, h)));
}

// power trooper alias uses same as trooper - registry may point to unit-power-trooper
write(
  "units/unit-power-trooper.svg",
  svg(
    64,
    64,
    `${shadow(32, 58, 14)}
  <path d="M22 50 L20 57 L28 57 L29 50 Z" fill="#1a1e24"/>
  <path d="M35 50 L34 57 L42 57 L40 50 Z" fill="#222830"/>
  <path d="M24 36 L22 50 L29 50 L30 36 Z" fill="url(#armor)"/>
  <path d="M34 36 L35 50 L42 50 L40 36 Z" fill="url(#camo)"/>
  <path d="M22 16 L22 36 L32 40 L42 36 L42 16 L32 12 Z" fill="url(#steel)" stroke="#0e1218" stroke-width="0.7"/>
  ${panel(24, 16, 16, 18, 3)}
  <path d="M26 10 L32 6 L38 10 L39 16 L32 18 L25 16 Z" fill="url(#steel)"/>
  <path d="M28 12 L32 11 L36 12 L35 15 L32 16 L29 15 Z" fill="url(#glass)"/>
  <rect x="44" y="26" width="16" height="2.5" fill="#2a3038"/>
  <path d="M30 22 L32 20 L34 22 L32 28 Z" fill="#c4a574" opacity="0.65"/>
  ${weather(22, 16, 20, 20)}`,
  ),
);

// siege mech - heavier variant
write(
  "units/unit-siege-mech.svg",
  svg(
    104,
    104,
    `${shadow(52, 96, 32, 6)}
  <path d="M30 82 L24 94 L46 94 L48 82 Z" fill="#1a1e24" stroke="#3a424c" stroke-width="0.6"/>
  <path d="M56 82 L58 94 L80 94 L74 82 Z" fill="#222830" stroke="#3a424c" stroke-width="0.6"/>
  <path d="M32 58 L30 82 L48 82 L50 60 Z" fill="url(#steel)" stroke="#1a2028" stroke-width="0.8"/>
  <path d="M54 60 L56 82 L74 82 L72 58 Z" fill="url(#steelSide)" stroke="#1a2028" stroke-width="0.8"/>
  <path d="M28 20 L28 58 L52 66 L76 58 L76 20 L52 12 Z" fill="url(#desert)" stroke="#0e1218" stroke-width="1"/>
  ${panel(32, 22, 40, 32, 4)}
  ${weather(28, 20, 48, 40)}
  <path d="M42 16 L52 12 L62 16 L60 28 L52 30 L44 28 Z" fill="url(#glass)"/>
  <rect x="8" y="36" width="22" height="8" rx="1" fill="#2a3038" stroke="#5c6876" stroke-width="0.5"/>
  <rect x="74" y="36" width="22" height="8" rx="1" fill="#2a3038" stroke="#5c6876" stroke-width="0.5"/>
  ${rivets([[34, 28], [70, 28], [36, 50], [68, 50]])}`,
  ),
);

// ─── BUILDINGS ─────────────────────────────────────────────

function bldgPad(w, h) {
  return `${shadow(w / 2, h - 4, w * 0.42, 4)}
  <rect x="${w * 0.08}" y="${h * 0.72}" width="${w * 0.84}" height="${h * 0.12}" fill="#1a2228" stroke="#3a4850" stroke-width="0.5"/>
  <rect x="${w * 0.12}" y="${h * 0.74}" width="${w * 0.76}" height="2" fill="#2a3840" opacity="0.5"/>`;
}

write(
  "buildings/building-nexus.svg",
  svg(
    128,
    128,
    `${bldgPad(128, 128)}
  <path d="M32 90 L40 50 L64 30 L88 50 L96 90 L64 105 Z" fill="url(#steel)" stroke="#0e1218" stroke-width="1.2"/>
  ${panel(42, 48, 44, 42, 4)}
  ${weather(36, 40, 56, 50)}
  <path d="M52 48 L64 38 L76 48 L72 68 L64 74 L56 68 Z" fill="url(#glass)" stroke="#1a3040" stroke-width="0.6"/>
  <circle cx="64" cy="56" r="6" fill="#1a4050" stroke="#4a8090" stroke-width="0.5"/>
  <rect x="58" y="20" width="12" height="14" fill="url(#armor)" stroke="#1a2218" stroke-width="0.5"/>
  <line x1="64" y1="20" x2="64" y2="10" stroke="#6a7684" stroke-width="1.5"/>
  <circle cx="64" cy="8" r="3" fill="#3a8090" opacity="0.8"/>
  ${rivets([[44, 60], [84, 60], [50, 85], [78, 85]])}`,
  ),
);

write(
  "buildings/building-reactor.svg",
  svg(
    80,
    80,
    `${bldgPad(80, 80)}
  <ellipse cx="40" cy="48" rx="24" ry="18" fill="url(#steel)" stroke="#0e1218" stroke-width="0.9"/>
  ${panel(24, 38, 32, 20, 3)}
  <ellipse cx="40" cy="42" rx="12" ry="9" fill="url(#glass)"/>
  <ellipse cx="40" cy="42" rx="5" ry="4" fill="#c4e0f0" opacity="0.35"/>
  <rect x="28" y="58" width="6" height="12" fill="#2a3038"/>
  <rect x="46" y="58" width="6" height="12" fill="#2a3038"/>
  ${weather(22, 36, 36, 24)}
  ${rivets([[28, 48], [52, 48]])}`,
  ),
);

write(
  "buildings/building-refinery.svg",
  svg(
    80,
    80,
    `${bldgPad(80, 80)}
  <rect x="18" y="36" width="44" height="32" fill="url(#desert)" stroke="#1a1810" stroke-width="0.8"/>
  ${panel(20, 38, 40, 28, 3)}
  <rect x="24" y="16" width="8" height="24" fill="url(#steel)" stroke="#1a2028" stroke-width="0.5"/>
  <rect x="36" y="12" width="8" height="28" fill="url(#steelSide)" stroke="#1a2028" stroke-width="0.5"/>
  <rect x="48" y="18" width="8" height="22" fill="url(#steel)" stroke="#1a2028" stroke-width="0.5"/>
  <path d="M26 16 L28 8 L32 8 L30 16 Z" fill="#3a424c"/>
  <path d="M38 12 L40 4 L44 4 L42 12 Z" fill="#3a424c"/>
  <path d="M50 18 L52 10 L56 10 L54 18 Z" fill="#3a424c"/>
  ${weather(18, 36, 44, 30)}`,
  ),
);

write(
  "buildings/building-laser.svg",
  svg(
    72,
    88,
    `${bldgPad(72, 88)}
  <rect x="26" y="50" width="20" height="28" fill="url(#steel)" stroke="#0e1218" stroke-width="0.7"/>
  ${panel(28, 52, 16, 24, 2)}
  <path d="M22 48 L36 28 L50 48 Z" fill="url(#armor)" stroke="#1a2218" stroke-width="0.6"/>
  <rect x="33" y="14" width="6" height="20" fill="#2a3038" stroke="#5c6876" stroke-width="0.4"/>
  <circle cx="36" cy="12" r="4" fill="url(#glass)" stroke="#4a8090" stroke-width="0.4"/>
  <circle cx="36" cy="12" r="1.5" fill="#e8f4f8"/>
  ${rivets([[30, 56], [42, 56]])}`,
  ),
);

write(
  "buildings/building-missile.svg",
  svg(
    72,
    88,
    `${bldgPad(72, 88)}
  <rect x="20" y="48" width="32" height="28" fill="url(#camo)" stroke="#0e1218" stroke-width="0.7"/>
  ${panel(22, 50, 28, 24, 3)}
  <rect x="24" y="20" width="7" height="32" rx="1" fill="url(#steel)" stroke="#1a2028" stroke-width="0.5"/>
  <rect x="33" y="16" width="7" height="36" rx="1" fill="url(#steelSide)" stroke="#1a2028" stroke-width="0.5"/>
  <rect x="42" y="22" width="7" height="30" rx="1" fill="url(#steel)" stroke="#1a2028" stroke-width="0.5"/>
  <path d="M24 20 L27.5 12 L31 20 Z" fill="#3a424c"/>
  <path d="M33 16 L36.5 8 L40 16 Z" fill="#3a424c"/>
  <path d="M42 22 L45.5 14 L49 22 Z" fill="#3a424c"/>`,
  ),
);

write(
  "buildings/building-shield.svg",
  svg(
    72,
    80,
    `${bldgPad(72, 80)}
  <path d="M28 60 L32 28 L40 20 L48 28 L52 60 Z" fill="url(#steel)" stroke="#0e1218" stroke-width="0.7"/>
  ${panel(32, 30, 16, 28, 2)}
  <path d="M30 36 L40 24 L50 36 L40 32 Z" fill="url(#glass)" opacity="0.7"/>
  <ellipse cx="40" cy="40" rx="18" ry="22" fill="none" stroke="#7eb6c9" stroke-width="0.8" opacity="0.35"/>
  <ellipse cx="40" cy="40" rx="22" ry="26" fill="none" stroke="#7eb6c9" stroke-width="0.4" opacity="0.2"/>`,
  ),
);

write(
  "buildings/building-supply.svg",
  svg(
    72,
    72,
    `${bldgPad(72, 72)}
  <rect x="16" y="28" width="40" height="30" fill="url(#desert)" stroke="#1a1810" stroke-width="0.7"/>
  ${panel(18, 30, 36, 26, 3)}
  <rect x="20" y="32" width="14" height="10" fill="#1a2028" stroke="#4a5460" stroke-width="0.4"/>
  <rect x="38" y="32" width="14" height="10" fill="#1a2028" stroke="#4a5460" stroke-width="0.4"/>
  <rect x="28" y="48" width="16" height="6" fill="#2a3038"/>
  ${weather(16, 28, 40, 28)}`,
  ),
);

const simpleBuildings = {
  "building-fabricator.svg": "factory",
  "building-geothermal.svg": "plant",
  "building-lab.svg": "lab",
  "building-war-college.svg": "lab",
  "building-cyber.svg": "lab",
  "building-flak.svg": "turret",
  "building-plasma.svg": "turret",
  "building-railgun.svg": "turret",
  "building-emp.svg": "turret",
  "building-point-defense.svg": "turret",
  "building-coastal.svg": "turret",
  "building-jammer.svg": "tower",
  "building-sonar.svg": "tower",
  "building-uplink.svg": "tower",
  "building-silo.svg": "silo",
  "building-drydock.svg": "dock",
  "building-repair.svg": "factory",
  "building-orbital-collector.svg": "orb",
  "building-dark-matter.svg": "orb",
  "building-shield-gen.svg": "tower",
};

function simpleBldg(kind, w = 72, h = 80) {
  const pad = bldgPad(w, h);
  if (kind === "turret") {
    return `${pad}
  <rect x="${w * 0.32}" y="${h * 0.48}" width="${w * 0.36}" height="${h * 0.28}" fill="url(#steel)" stroke="#0e1218" stroke-width="0.6"/>
  <path d="M${w * 0.28} ${h * 0.5} L${w * 0.5} ${h * 0.28} L${w * 0.72} ${h * 0.5} Z" fill="url(#armor)"/>
  <rect x="${w * 0.46}" y="${h * 0.16}" width="${w * 0.08}" height="${h * 0.2}" fill="#2a3038"/>`;
  }
  if (kind === "tower") {
    return `${pad}
  <rect x="${w * 0.38}" y="${h * 0.25}" width="${w * 0.24}" height="${h * 0.5}" fill="url(#steel)" stroke="#0e1218" stroke-width="0.6"/>
  ${panel(w * 0.4, h * 0.28, w * 0.2, h * 0.4, 2)}
  <circle cx="${w / 2}" cy="${h * 0.22}" r="5" fill="url(#glass)"/>`;
  }
  if (kind === "silo") {
    return `${pad}
  <rect x="${w * 0.3}" y="${h * 0.2}" width="${w * 0.4}" height="${h * 0.55}" rx="2" fill="url(#desert)" stroke="#1a1810" stroke-width="0.7"/>
  ${panel(w * 0.32, h * 0.22, w * 0.36, h * 0.5, 2)}`;
  }
  if (kind === "dock") {
    return `${pad}
  <rect x="${w * 0.1}" y="${h * 0.45}" width="${w * 0.8}" height="${h * 0.3}" fill="#1a2830" stroke="#3a4850" stroke-width="0.6"/>
  <rect x="${w * 0.2}" y="${h * 0.3}" width="${w * 0.15}" height="${h * 0.2}" fill="url(#steel)"/>
  <rect x="${w * 0.65}" y="${h * 0.3}" width="${w * 0.15}" height="${h * 0.2}" fill="url(#steel)"/>`;
  }
  if (kind === "orb") {
    return `${pad}
  <ellipse cx="${w / 2}" cy="${h * 0.42}" rx="${w * 0.28}" ry="${h * 0.22}" fill="url(#steel)" stroke="#0e1218" stroke-width="0.7"/>
  <ellipse cx="${w / 2}" cy="${h * 0.4}" rx="${w * 0.12}" ry="${h * 0.1}" fill="url(#glass)"/>`;
  }
  if (kind === "lab") {
    return `${pad}
  <rect x="${w * 0.18}" y="${h * 0.35}" width="${w * 0.64}" height="${h * 0.4}" fill="url(#steel)" stroke="#0e1218" stroke-width="0.7"/>
  ${panel(w * 0.2, h * 0.37, w * 0.6, h * 0.35, 3)}
  <rect x="${w * 0.3}" y="${h * 0.22}" width="${w * 0.4}" height="${h * 0.16}" fill="url(#glass)" stroke="#1a3040" stroke-width="0.4"/>`;
  }
  // factory
  return `${pad}
  <rect x="${w * 0.15}" y="${h * 0.35}" width="${w * 0.7}" height="${h * 0.4}" fill="url(#camo)" stroke="#0e1218" stroke-width="0.7"/>
  ${panel(w * 0.18, h * 0.37, w * 0.64, h * 0.35, 4)}
  <rect x="${w * 0.25}" y="${h * 0.18}" width="${w * 0.1}" height="${h * 0.2}" fill="url(#steel)"/>
  <rect x="${w * 0.45}" y="${h * 0.14}" width="${w * 0.1}" height="${h * 0.24}" fill="url(#steelSide)"/>
  <rect x="${w * 0.65}" y="${h * 0.2}" width="${w * 0.1}" height="${h * 0.18}" fill="url(#steel)"/>`;
}

for (const [file, kind] of Object.entries(simpleBuildings)) {
  write(`buildings/${file}`, svg(72, 80, simpleBldg(kind)));
}

write(
  "buildings/building-shield-gen.svg",
  svg(80, 80, simpleBldg("tower", 80, 80)),
);

// Effects — more realistic
write(
  "effects/fx-explosion.svg",
  svg(
    96,
    96,
    `  <circle cx="48" cy="52" r="28" fill="#1a1008" opacity="0.35"/>
  <path d="M48 70 L40 48 L28 42 L38 36 L32 20 L48 30 L64 18 L58 36 L70 40 L56 48 Z" fill="#ff exp" />
  <path d="M48 70 L40 48 L28 42 L38 36 L32 20 L48 30 L64 18 L58 36 L70 40 L56 48 Z" fill="#ff9020"/>
  <path d="M48 62 L42 46 L36 42 L44 38 L40 26 L48 34 L56 24 L52 38 L62 42 L54 46 Z" fill="#ffe080"/>
  <circle cx="48" cy="40" r="8" fill="#fff8e0" opacity="0.9"/>
  <circle cx="48" cy="72" r="16" fill="#2a2018" opacity="0.4" filter="url(#soft)"/>`,
  ),
);

// fix typo in explosion
write(
  "effects/fx-explosion.svg",
  svg(
    96,
    96,
    `  <ellipse cx="48" cy="72" rx="26" ry="8" fill="#1a1008" opacity="0.4"/>
  <path d="M48 70 L38 46 L24 40 L36 34 L28 16 L48 28 L68 14 L60 34 L74 40 L58 46 Z" fill="#e07020"/>
  <path d="M48 64 L40 46 L32 42 L42 36 L36 22 L48 32 L60 20 L54 36 L66 42 L56 46 Z" fill="#ffb040"/>
  <path d="M48 56 L44 42 L40 40 L46 36 L44 28 L48 34 L52 26 L50 36 L56 40 L50 42 Z" fill="#fff0c0"/>
  <circle cx="48" cy="38" r="6" fill="#ffffff" opacity="0.85"/>`,
  ),
);

write(
  "effects/fx-muzzle.svg",
  svg(
    48,
    24,
    `  <ellipse cx="12" cy="12" rx="10" ry="6" fill="url(#muzzle)"/>
  <path d="M8 12 L40 6 L40 18 Z" fill="#ffc060" opacity="0.7"/>
  <circle cx="10" cy="12" r="3" fill="#fff8e0"/>`,
  ),
);

write(
  "effects/fx-wreck.svg",
  svg(
    64,
    48,
    `${shadow(32, 42, 20, 4)}
  <path d="M12 30 L18 16 L30 20 L40 12 L52 22 L48 36 L20 38 Z" fill="#2a2420" stroke="#1a1814" stroke-width="0.6"/>
  <path d="M20 28 L28 18 L36 26" stroke="#4a4038" stroke-width="1.5"/>
  <circle cx="24" cy="30" r="3" fill="#1a1008"/>
  <path d="M38 24 L46 18 L50 28" stroke="#5a5048" stroke-width="1.2"/>
  <rect x="22" y="26" width="14" height="4" fill="#3a342e" opacity="0.6"/>`,
  ),
);

write(
  "effects/fx-emp.svg",
  svg(
    80,
    80,
    `  <circle cx="40" cy="40" r="30" fill="none" stroke="#7eb6c9" stroke-width="2" opacity="0.5"/>
  <circle cx="40" cy="40" r="20" fill="none" stroke="#a8d4e0" stroke-width="1.5" opacity="0.6"/>
  <circle cx="40" cy="40" r="10" fill="#c8e8f0" opacity="0.35"/>
  <circle cx="40" cy="40" r="4" fill="#ffffff" opacity="0.8"/>`,
  ),
);

write(
  "effects/fx-laser.svg",
  svg(
    64,
    8,
    `  <rect x="0" y="2" width="64" height="4" rx="2" fill="#9fd4e4" opacity="0.9"/>
  <rect x="0" y="3" width="64" height="2" fill="#e8f4f8"/>`,
  ),
);

write(
  "effects/fx-plasma.svg",
  svg(
    24,
    24,
    `  <circle cx="12" cy="12" r="8" fill="#4a9070" opacity="0.5"/>
  <circle cx="12" cy="12" r="5" fill="#6ec4a0"/>
  <circle cx="12" cy="12" r="2.5" fill="#c8f0d8"/>`,
  ),
);

write(
  "effects/fx-smoke.svg",
  svg(
    64,
    64,
    `  <ellipse cx="32" cy="48" rx="18" ry="8" fill="#2a2824" opacity="0.35"/>
  <ellipse cx="28" cy="36" rx="14" ry="12" fill="#3a3834" opacity="0.4"/>
  <ellipse cx="38" cy="24" rx="12" ry="14" fill="#4a4844" opacity="0.3"/>
  <ellipse cx="30" cy="14" rx="10" ry="10" fill="#5a5854" opacity="0.22"/>`,
  ),
);

console.log("Wrote realistic military sprites to", ROOT);
