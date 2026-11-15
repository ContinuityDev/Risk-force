#!/usr/bin/env node
/**
 * Build Risk Force territories from locally-bundled Natural Earth / world-atlas
 * TopoJSON (countries-110m). Projects with d3-geo equirectangular.
 * Run: node scripts/gen-earth-map.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  geoArea,
  geoEquirectangular,
  geoPath,
} from "d3-geo";
import polylabel from "polylabel";
import { feature } from "topojson-client";
import { presimplify, quantile, simplify } from "topojson-simplify";
import {
  SEA_ROUTE_PAIRS,
  buildTerritoryDefs,
} from "./build-territory-defs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "src/data/map/raw");
const OUT_W = 1000;
const OUT_H = 500;

// Prefer 50m coasts when present; fall back to 110m.
const countriesFile = existsSync(join(RAW, "countries-50m.json"))
  ? "countries-50m.json"
  : "countries-110m.json";
const landFile = existsSync(join(RAW, "land-50m.json"))
  ? "land-50m.json"
  : "land-110m.json";
console.log("using", countriesFile, landFile);

let topo = JSON.parse(readFileSync(join(RAW, countriesFile), "utf8"));
let landTopo = JSON.parse(readFileSync(join(RAW, landFile), "utf8"));

// 110m is already compact enough for the game map; only simplify 50m+.
if (countriesFile.includes("50m")) {
  const pre = presimplify(topo);
  topo = simplify(pre, quantile(pre, 0.4));
  const preL = presimplify(landTopo);
  landTopo = simplify(preL, quantile(preL, 0.4));
}

const countries = feature(topo, topo.objects.countries).features;
const byName = Object.fromEntries(countries.map((f) => [f.properties.name, f]));

const DEFS = buildTerritoryDefs(topo, byName);
console.log("built defs:", DEFS.length);

function toMulti(geom) {
  if (!geom) return { type: "MultiPolygon", coordinates: [] };
  if (geom.type === "Polygon")
    return { type: "MultiPolygon", coordinates: [geom.coordinates] };
  if (geom.type === "MultiPolygon") return geom;
  return { type: "MultiPolygon", coordinates: [] };
}

const projection = geoEquirectangular()
  .scale(OUT_W / (2 * Math.PI))
  .translate([OUT_W / 2, OUT_H / 2])
  .precision(0.35);
const pathGen = geoPath(projection);

function pathFromGeom(geom) {
  if (!geom) return "";
  return pathGen(geom) || "";
}

/** Project lon/lat ring → screen px for polylabel. */
function projectRing(ring) {
  return ring.map(([lon, lat]) => {
    const p = projection([lon, lat]);
    return p ? [p[0], p[1]] : [0, 0];
  });
}

/**
 * Pole of inaccessibility (polylabel) on the largest projected polygon.
 * Falls back to path centroid when geometry is degenerate.
 */
function labelFor(geom) {
  const m = toMulti(geom);
  let bestRings = null;
  let bestA = -1;
  for (const poly of m.coordinates) {
    const g = { type: "Polygon", coordinates: poly };
    const a = geoArea(g);
    if (a > bestA) {
      bestA = a;
      bestRings = poly;
    }
  }
  if (bestRings?.length) {
    try {
      const projected = bestRings.map(projectRing);
      const [x, y] = polylabel(projected, 1.0);
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= -20 &&
        x <= OUT_W + 20 &&
        y >= -20 &&
        y <= OUT_H + 20
      ) {
        return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      }
    } catch {
      /* fall through */
    }
  }
  const c = pathGen.centroid(geom) || [OUT_W / 2, OUT_H / 2];
  return {
    x: Math.round(c[0] * 10) / 10,
    y: Math.round(c[1] * 10) / 10,
  };
}

/** Map spherical area → label font size in [10, 15]. */
function labelSizeFor(area, allAreas) {
  const sorted = [...allAreas].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.15)] ?? area;
  const hi = sorted[Math.floor(sorted.length * 0.85)] ?? area;
  const t = hi > lo ? Math.min(1, Math.max(0, (area - lo) / (hi - lo))) : 0.5;
  return Math.round((10 + t * 5) * 10) / 10;
}

const draft = [];
for (const d of DEFS) {
  if (!d.geom || !toMulti(d.geom).coordinates.length) {
    console.warn("empty geom:", d.id);
    continue;
  }
  const area = geoArea(d.geom);
  if (area < 1e-7) {
    console.warn("tiny geom:", d.id, area);
    continue;
  }
  const path = pathFromGeom(d.geom);
  if (!path || path.length < 8) {
    console.warn("no path:", d.id);
    continue;
  }
  draft.push({
    id: d.id,
    name: d.name,
    continent: d.continent,
    path,
    label: labelFor(d.geom),
    area,
    neighbors: d.neighbors,
    startingOwner: d.startingOwner,
    coastal: d.coastal,
  });
}
const areas = draft.map((t) => t.area);
const territories = draft.map((t) => ({
  ...t,
  labelSize: labelSizeFor(t.area, areas),
}));

console.log("territories:", territories.length);
for (const id of [
  "alaska",
  "united_kingdom",
  "france",
  "brazil_north",
  "egypt",
  "china_east",
  "japan",
  "ural",
  "siberia",
  "kamchatka",
  "western_australia",
]) {
  const t = territories.find((x) => x.id === id);
  console.log(" ", id, t?.label, "path", t?.path?.length);
}

const landFeat = feature(landTopo, landTopo.objects.land);
const landPath = pathGen(landFeat);

const seaRoutes = SEA_ROUTE_PAIRS;

function routePath(a, b) {
  const ta = territories.find((t) => t.id === a);
  const tb = territories.find((t) => t.id === b);
  if (!ta || !tb) return null;
  const mx = (ta.label.x + tb.label.x) / 2;
  const my = (ta.label.y + tb.label.y) / 2 - 16;
  return `M ${ta.label.x},${ta.label.y} Q ${mx},${my} ${tb.label.x},${tb.label.y}`;
}

const SEA_ROUTES = seaRoutes
  .map((r) => {
    const d = routePath(r.from, r.to);
    return d ? { d } : null;
  })
  .filter(Boolean);

let ts = `import type { TerritoryDef } from "../types";

/**
 * Risk Force Earth theater — real Natural Earth country borders
 * (world-atlas countries-50m simplified), equirectangular projection.
 * Generated by scripts/gen-earth-map.mjs — do not hand-edit paths.
 * viewBox 0 0 ${OUT_W} ${OUT_H}
 */
export const TERRITORIES: TerritoryDef[] = [
`;

for (const t of territories) {
  ts += `  {
    id: ${JSON.stringify(t.id)},
    name: ${JSON.stringify(t.name)},
    continent: ${JSON.stringify(t.continent)},
    path: ${JSON.stringify(t.path)},
    label: { x: ${t.label.x}, y: ${t.label.y} },
    labelSize: ${t.labelSize},
    area: ${t.area},
    neighbors: ${JSON.stringify(t.neighbors)},
    startingOwner: ${JSON.stringify(t.startingOwner)},
    coastal: ${t.coastal},
    grid: { cols: 6, rows: 5 },
  },
`;
}

ts += `];

export const TERRITORY_BY_ID = Object.fromEntries(
  TERRITORIES.map((t) => [t.id, t]),
) as Record<string, TerritoryDef>;

export function getTerritory(id: string): TerritoryDef {
  const t = TERRITORY_BY_ID[id];
  if (!t) throw new Error(\`Unknown territory: \${id}\`);
  return t;
}
`;

writeFileSync(join(ROOT, "src/data/map/territories.ts"), ts);

const earth = `/**
 * Earth backdrop for the holographic theater map.
 * Land silhouette from world-atlas land-110m (equirectangular).
 * Generated by scripts/gen-earth-map.mjs
 */
export const OCEAN_VIEW = { w: ${OUT_W}, h: ${OUT_H} };

/** Full landmass underlay — recognisable continents & coastlines. */
export const LAND_PATH = ${JSON.stringify(landPath)};

/** Kept for API compatibility with earlier silhouette array. */
export const CONTINENT_SILHOUETTES: { id: string; d: string }[] = [
  { id: "land", d: LAND_PATH },
];

export const SEA_ROUTES: { d: string }[] = ${JSON.stringify(SEA_ROUTES, null, 2)};
`;

writeFileSync(join(ROOT, "src/data/map/earthPaths.ts"), earth);
console.log("wrote territories.ts + earthPaths.ts");
