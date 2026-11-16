#!/usr/bin/env node
/**
 * Bake lobby map-picker thumbnails from live territory geometry
 * (mini Earth + mini USA with state borders), styled like the game map.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EARTH_TERRITORIES } from "../src/data/map/territories.ts";
import { LAND_PATH } from "../src/data/map/earthPaths.ts";
import { CIVIL_WAR_TERRITORIES } from "../src/data/maps/civilWar/territories.ts";
import { CIVIL_WAR_LAND_PATH } from "../src/data/maps/civilWar/paths.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../public/maps");
mkdirSync(OUT, { recursive: true });

const FACTION = ["#5a9e82", "#b87070", "#6a8eb8"];
/** Match in-game neutral slate (no parchment / hatch). */
const NEUTRAL = "#7a8490";

function pickHighlights(territories, count = 3) {
  const ranked = [...territories]
    .filter((t) => t.neighbors.length >= 2)
    .sort((a, b) => b.area - a.area);
  const picks = [];
  const used = new Set();
  for (const t of ranked) {
    if (picks.length >= count) break;
    if ([...used].some((id) => t.neighbors.includes(id))) continue;
    picks.push(t);
    used.add(t.id);
  }
  while (picks.length < count && ranked.length) {
    const t = ranked[picks.length];
    if (t && !used.has(t.id)) {
      picks.push(t);
      used.add(t.id);
    } else break;
  }
  return picks;
}

function renderPreview({
  label,
  territories,
  landPath,
  highlights,
}) {
  const highlightIds = new Map(
    highlights.map((t, i) => [t.id, FACTION[i % FACTION.length]]),
  );
  const paths = territories
    .map((t) => {
      const fill = highlightIds.get(t.id) ?? NEUTRAL;
      const opacity = highlightIds.has(t.id) ? 0.88 : 0.55;
      const stroke = highlightIds.has(t.id) ? "#7eb6c9" : "#9aa3ad";
      return `<path d="${t.path}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="0.55" stroke-linejoin="round"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" role="img" aria-label="${label} preview">
  <defs>
    <radialGradient id="ocean" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#1a3a52"/>
      <stop offset="45%" stop-color="#0f2438"/>
      <stop offset="100%" stop-color="#070e18"/>
    </radialGradient>
  </defs>
  <rect width="1000" height="500" fill="url(#ocean)"/>
  <path d="${landPath}" fill="#0c1824" fill-opacity="0.45" stroke="#3a5a6a" stroke-width="0.5" pointer-events="none"/>
  ${paths}
</svg>
`;
}

const earthHighlights = pickHighlights(EARTH_TERRITORIES, 3);
const cwHighlights = pickHighlights(CIVIL_WAR_TERRITORIES, 3);

writeFileSync(
  join(OUT, "world-war-preview.svg"),
  renderPreview({
    label: "World War",
    territories: EARTH_TERRITORIES,
    landPath: LAND_PATH,
    highlights: earthHighlights,
  }),
);

writeFileSync(
  join(OUT, "civil-war-preview.svg"),
  renderPreview({
    label: "Civil War",
    territories: CIVIL_WAR_TERRITORIES,
    landPath: CIVIL_WAR_LAND_PATH,
    highlights: cwHighlights,
  }),
);

console.log(
  "wrote previews",
  earthHighlights.map((t) => t.id).join(","),
  "|",
  cwHighlights.map((t) => t.id).join(","),
);
