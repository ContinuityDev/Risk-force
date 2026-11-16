#!/usr/bin/env node
/**
 * Bake Civil War USA map from us-atlas states-albers-10m (ISC / Census).
 * viewBox 0 0 1000 500 — Albers USA with AK/HI insets already in the source.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as topojson from "topojson-client";
import polylabel from "polylabel";
import statesTopo from "us-atlas/states-albers-10m.json" with { type: "json" };
import nationTopo from "us-atlas/nation-albers-10m.json" with { type: "json" };

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../src/data/maps/civilWar");
mkdirSync(OUT, { recursive: true });

const SKIP = new Set([
  "American Samoa",
  "Commonwealth of the Northern Mariana Islands",
  "Guam",
  "Puerto Rico",
  "United States Virgin Islands",
]);

/** Fold DC into Maryland for adjacency / ownership. */
const FOLD_INTO = { "District of Columbia": "Maryland" };

const REGIONS = {
  "New England": ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut"],
  "Mid-Atlantic": ["New York", "New Jersey", "Pennsylvania", "Delaware", "Maryland"],
  Southeast: [
    "Virginia", "West Virginia", "North Carolina", "South Carolina", "Georgia",
    "Florida", "Alabama", "Mississippi", "Tennessee", "Kentucky", "Louisiana", "Arkansas",
  ],
  Midwest: ["Ohio", "Indiana", "Illinois", "Michigan", "Wisconsin", "Minnesota"],
  "Great Plains": ["Iowa", "Missouri", "North Dakota", "South Dakota", "Nebraska", "Kansas", "Oklahoma"],
  Southwest: ["Texas", "New Mexico", "Arizona"],
  "Mountain West": ["Colorado", "Utah", "Nevada", "Wyoming", "Montana", "Idaho"],
  Pacific: ["Washington", "Oregon", "California", "Alaska", "Hawaii"],
};

const REGION_OF = {};
for (const [region, names] of Object.entries(REGIONS)) {
  for (const n of names) REGION_OF[n] = region;
}

const POSTAL = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN",
  Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

const COASTAL = new Set([
  "Maine", "New Hampshire", "Massachusetts", "Rhode Island", "Connecticut",
  "New York", "New Jersey", "Delaware", "Maryland", "Virginia", "North Carolina",
  "South Carolina", "Georgia", "Florida", "Alabama", "Mississippi", "Louisiana",
  "Texas", "California", "Oregon", "Washington", "Alaska", "Hawaii",
  // Great Lakes naval access
  "Minnesota", "Wisconsin", "Michigan", "Illinois", "Indiana", "Ohio", "Pennsylvania",
]);

const URBAN = new Set([
  "New York", "California", "Illinois", "Texas", "Florida", "Pennsylvania",
  "Massachusetts", "New Jersey", "Washington", "Virginia", "Maryland", "Georgia",
]);
const MOUNTAIN = new Set([
  "Colorado", "Utah", "Nevada", "Wyoming", "Montana", "Idaho", "West Virginia",
  "Alaska", "New Mexico", "Arizona",
]);
const DESERT = new Set(["Arizona", "Nevada", "New Mexico", "Utah"]);
const ARCTIC = new Set(["Alaska"]);

/** Rough relative population weights (2020-ish, scaled). */
const POP_WEIGHT = {
  California: 39, Texas: 29, Florida: 22, "New York": 20, Pennsylvania: 13,
  Illinois: 12.5, Ohio: 11.7, Georgia: 10.7, "North Carolina": 10.4, Michigan: 10,
  "New Jersey": 9.3, Virginia: 8.6, Washington: 7.7, Arizona: 7.2, Massachusetts: 7,
  Tennessee: 6.9, Indiana: 6.8, Missouri: 6.2, Maryland: 6.2, Wisconsin: 5.9,
  Colorado: 5.8, Minnesota: 5.7, "South Carolina": 5.1, Alabama: 5, Louisiana: 4.6,
  Kentucky: 4.5, Oregon: 4.2, Oklahoma: 4, Connecticut: 3.6, Utah: 3.3,
  Iowa: 3.2, Nevada: 3.1, Arkansas: 3, Mississippi: 2.9, Kansas: 2.9,
  "New Mexico": 2.1, Nebraska: 2, Idaho: 1.9, "West Virginia": 1.8, Hawaii: 1.4,
  "New Hampshire": 1.4, Maine: 1.4, Montana: 1.1, "Rhode Island": 1.1,
  Delaware: 1, "South Dakota": 0.9, "North Dakota": 0.8, Alaska: 0.7,
  Vermont: 0.6, Wyoming: 0.6,
};

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

function largestRing(geom) {
  let best = null;
  let bestA = 0;
  const visit = (coords, depth) => {
    if (!coords?.length) return;
    if (typeof coords[0][0] === "number") {
      const a = ringArea(coords);
      if (a > bestA) {
        bestA = a;
        best = coords;
      }
      return;
    }
    for (const c of coords) visit(c, depth + 1);
  };
  visit(geom.coordinates, 0);
  return best;
}

function pathFromGeom(geom) {
  // Manual SVG path — avoid d3-geo dependency on already-projected coords
  const parts = [];
  const writePoly = (rings) => {
    for (const ring of rings) {
      if (!ring?.length) continue;
      parts.push(`M${ring[0][0].toFixed(3)},${ring[0][1].toFixed(3)}`);
      for (let i = 1; i < ring.length; i++) {
        parts.push(`L${ring[i][0].toFixed(3)},${ring[i][1].toFixed(3)}`);
      }
      parts.push("Z");
    }
  };
  if (geom.type === "Polygon") writePoly(geom.coordinates);
  else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) writePoly(poly);
  }
  return parts.join("");
}

// Scale Albers (~1015×594) into viewBox 1000×500 with padding
const PAD = 12;
const SRC_W = 1014.7;
const SRC_H = 593.6;
const SRC_MIN_X = -57.63;
const SRC_MIN_Y = 12.98;
const scale = Math.min((1000 - PAD * 2) / SRC_W, (500 - PAD * 2) / SRC_H);
const ox = (1000 - SRC_W * scale) / 2 - SRC_MIN_X * scale;
const oy = (500 - SRC_H * scale) / 2 - SRC_MIN_Y * scale;

function projectCoord(c) {
  return [c[0] * scale + ox, c[1] * scale + oy];
}

function projectGeom(geom) {
  const mapRing = (ring) => ring.map(projectCoord);
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map(mapRing) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geom.coordinates.map((poly) => poly.map(mapRing)),
  };
}

const geoms = statesTopo.objects.states.geometries;
const nameToIndex = new Map();
geoms.forEach((g, i) => nameToIndex.set(g.properties.name, i));

// Merge DC arcs into Maryland in the topology sense via neighbor override
const rawNeighbors = topojson.neighbors(geoms);

const features = [];
const idByName = new Map();
for (const g of geoms) {
  const name = g.properties.name;
  if (SKIP.has(name) || FOLD_INTO[name]) continue;
  if (!REGION_OF[name]) {
    console.warn("unmapped region", name);
    continue;
  }
  const feat = topojson.feature(statesTopo, g);
  const projected = projectGeom(feat.geometry);
  const id = slug(name);
  idByName.set(name, id);
  features.push({ name, id, geometry: projected, index: nameToIndex.get(name) });
}

// Extra naval/air links for insets
const EXTRA_LINKS = [
  ["Alaska", "Washington"],
  ["Hawaii", "California"],
];

function biomeFor(name) {
  if (ARCTIC.has(name)) return "arctic";
  if (DESERT.has(name)) return "desert";
  if (MOUNTAIN.has(name)) return "mountain";
  if (URBAN.has(name)) return "urban";
  if (COASTAL.has(name)) return "coastal";
  return "plains";
}

const territories = [];
const biomes = {};
const abbreviations = {};

for (const f of features) {
  const ring = largestRing(f.geometry);
  const [lx, ly] = ring ? polylabel([ring], 1.0) : [500, 250];
  const area = ring ? ringArea(ring) / (1000 * 500) : 0.01;
  const nIdx = rawNeighbors[f.index] ?? [];
  const neighborNames = new Set();
  for (const j of nIdx) {
    const nName = geoms[j].properties.name;
    const folded = FOLD_INTO[nName] ?? nName;
    if (folded === f.name) continue;
    if (SKIP.has(folded)) continue;
    if (idByName.has(folded)) neighborNames.add(folded);
  }
  // DC folded: Maryland inherits DC's neighbors
  if (f.name === "Maryland") {
    const dcIdx = nameToIndex.get("District of Columbia");
    if (dcIdx != null) {
      for (const j of rawNeighbors[dcIdx] ?? []) {
        const nName = geoms[j].properties.name;
        const folded = FOLD_INTO[nName] ?? nName;
        if (folded !== f.name && idByName.has(folded)) neighborNames.add(folded);
      }
    }
  }
  for (const [a, b] of EXTRA_LINKS) {
    if (f.name === a) neighborNames.add(b);
    if (f.name === b) neighborNames.add(a);
  }

  const labelSize = area > 0.04 ? 13 : area > 0.02 ? 11.5 : area > 0.01 ? 10.5 : 9.5;
  territories.push({
    id: f.id,
    name: f.name,
    continent: REGION_OF[f.name],
    path: pathFromGeom(f.geometry),
    label: { x: +lx.toFixed(2), y: +ly.toFixed(2) },
    labelSize,
    area,
    neighbors: [...neighborNames].map((n) => idByName.get(n)).filter(Boolean).sort(),
    startingOwner: "neutral",
    coastal: COASTAL.has(f.name),
    grid: { cols: 6, rows: 5 },
    popWeight: POP_WEIGHT[f.name] ?? 1,
  });
  biomes[f.id] = biomeFor(f.name);
  abbreviations[f.id] = POSTAL[f.name] ?? f.name.slice(0, 2).toUpperCase();
}

// Symmetrize neighbors
const byId = Object.fromEntries(territories.map((t) => [t.id, t]));
for (const t of territories) {
  for (const n of t.neighbors) {
    if (!byId[n].neighbors.includes(t.id)) byId[n].neighbors.push(t.id);
  }
}
for (const t of territories) t.neighbors.sort();

// Land underlay from nation mesh
const nationFc = topojson.feature(nationTopo, nationTopo.objects.nation);
const nationGeom =
  nationFc.type === "FeatureCollection"
    ? nationFc.features[0]?.geometry
    : nationFc.geometry;
if (!nationGeom) throw new Error("missing nation geometry");
const landPath = pathFromGeom(projectGeom(nationGeom));

// Sea / air routes for AK–WA and HI–CA
function route(aId, bId) {
  const a = byId[aId];
  const b = byId[bId];
  const mx = (a.label.x + b.label.x) / 2;
  const my = Math.min(a.label.y, b.label.y) - 30;
  return {
    d: `M ${a.label.x},${a.label.y} Q ${mx},${my} ${b.label.x},${b.label.y}`,
  };
}
const seaRoutes = [
  route("alaska", "washington"),
  route("hawaii", "california"),
];

const continents = {
  "New England": {
    id: "new_england",
    name: "New England",
    energy: 28,
    alloy: 10,
    population: 3,
    color: "#7eb6c9",
  },
  "Mid-Atlantic": {
    id: "mid_atlantic",
    name: "Mid-Atlantic",
    energy: 36,
    alloy: 14,
    population: 4,
    color: "#6a8eb8",
  },
  Southeast: {
    id: "southeast",
    name: "Southeast",
    energy: 40,
    alloy: 12,
    population: 5,
    color: "#c07070",
  },
  Midwest: {
    id: "midwest",
    name: "Midwest",
    energy: 34,
    alloy: 14,
    population: 4,
    color: "#6aaa8a",
  },
  "Great Plains": {
    id: "great_plains",
    name: "Great Plains",
    energy: 30,
    alloy: 11,
    population: 3,
    color: "#c4a574",
  },
  Southwest: {
    id: "southwest",
    name: "Southwest",
    energy: 32,
    alloy: 13,
    population: 3,
    color: "#b89a5a",
  },
  "Mountain West": {
    id: "mountain_west",
    name: "Mountain West",
    energy: 26,
    alloy: 12,
    population: 2,
    color: "#a88bc4",
  },
  Pacific: {
    id: "pacific",
    name: "Pacific",
    energy: 38,
    alloy: 15,
    population: 4,
    color: "#6ec4a0",
  },
};

function emitTerritories() {
  const rows = territories.map((t) => {
    const { popWeight, ...rest } = t;
    return `  ${JSON.stringify(rest, null, 2).replace(/\n/g, "\n  ")}`;
  });
  return `import type { TerritoryDef } from "../../types";

/** Civil War USA — 50 states from us-atlas Albers (ISC). Generated — do not hand-edit paths. */
export const CIVIL_WAR_TERRITORIES: TerritoryDef[] = [
${rows.join(",\n")}
];

export const CIVIL_WAR_POP_WEIGHT: Record<string, number> = ${JSON.stringify(
    Object.fromEntries(territories.map((t) => [t.id, t.popWeight])),
    null,
    2,
  )};
`;
}

writeFileSync(join(OUT, "territories.ts"), emitTerritories());
writeFileSync(
  join(OUT, "paths.ts"),
  `/** Civil War land underlay + naval/air inset routes. Generated. */
export const CIVIL_WAR_VIEW = { w: 1000, h: 500 };
export const CIVIL_WAR_LAND_PATH = ${JSON.stringify(landPath)};
export const CIVIL_WAR_SEA_ROUTES: { d: string }[] = ${JSON.stringify(seaRoutes, null, 2)};
`,
);
writeFileSync(
  join(OUT, "continents.ts"),
  `import type { ContinentBonus } from "../../continents";

export const CIVIL_WAR_CONTINENTS: Record<string, ContinentBonus> = ${JSON.stringify(
    continents,
    null,
    2,
  )};
`,
);
writeFileSync(
  join(OUT, "meta.ts"),
  `import type { BiomeId } from "../../biomes";

export const CIVIL_WAR_BIOMES: Record<string, BiomeId> = ${JSON.stringify(biomes, null, 2)};

export const CIVIL_WAR_ABBREV: Record<string, string> = ${JSON.stringify(
    abbreviations,
    null,
    2,
  )};
`,
);

// Connectivity check
const start = territories[0].id;
const seen = new Set([start]);
const q = [start];
while (q.length) {
  const id = q.pop();
  for (const n of byId[id].neighbors) {
    if (!seen.has(n)) {
      seen.add(n);
      q.push(n);
    }
  }
}
console.log(
  `civil war: ${territories.length} states, connected ${seen.size}/${territories.length}`,
);
if (seen.size !== territories.length) {
  const missing = territories.filter((t) => !seen.has(t.id)).map((t) => t.id);
  console.error("disconnected", missing);
  process.exit(1);
}
