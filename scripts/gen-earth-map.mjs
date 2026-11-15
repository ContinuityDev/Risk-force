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
  geoBounds,
  geoEquirectangular,
  geoPath,
} from "d3-geo";
import { feature, merge as topoMerge } from "topojson-client";
import { presimplify, quantile, simplify } from "topojson-simplify";

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

function must(...names) {
  const out = [];
  for (const n of names) {
    if (!byName[n]) {
      console.warn("missing country:", n);
      continue;
    }
    out.push(byName[n]);
  }
  return out;
}

function toMulti(geom) {
  if (!geom) return { type: "MultiPolygon", coordinates: [] };
  if (geom.type === "Polygon")
    return { type: "MultiPolygon", coordinates: [geom.coordinates] };
  if (geom.type === "MultiPolygon") return geom;
  return { type: "MultiPolygon", coordinates: [] };
}

/** Keep only polygons whose centroid falls in a lon/lat box (strip colonies). */
function filterMetropole(geom, lonRange, latRange) {
  const m = toMulti(geom);
  const kept = [];
  for (const poly of m.coordinates) {
    const g = { type: "Polygon", coordinates: poly };
    if (geoArea(g) < 1e-8) continue;
    const b = geoBounds(g);
    const cx = (b[0][0] + b[1][0]) / 2;
    const cy = (b[0][1] + b[1][1]) / 2;
    if (
      cx >= lonRange[0] &&
      cx <= lonRange[1] &&
      cy >= latRange[0] &&
      cy <= latRange[1]
    ) {
      kept.push(poly);
    }
  }
  return { type: "MultiPolygon", coordinates: kept };
}

/**
 * Dissolve internal borders between adjacent countries via topojson.merge
 * so each territory is one outline (no country-line seams inside).
 */
function mergeByNames(names) {
  const feats = must(...names);
  if (!feats.length) return { type: "MultiPolygon", coordinates: [] };
  const ids = new Set(feats.map((f) => f.id));
  const geoms = topo.objects.countries.geometries.filter((g) =>
    ids.has(g.id),
  );
  if (!geoms.length) return { type: "MultiPolygon", coordinates: [] };
  return toMulti(topoMerge(topo, geoms));
}

/** @deprecated use mergeByNames — kept for call sites that pass Feature[] */
function mergeFeatures(feats) {
  const names = feats.filter(Boolean).map((f) => f.properties?.name).filter(Boolean);
  if (names.length) return mergeByNames(names);
  const coords = [];
  for (const f of feats) {
    if (!f?.geometry) continue;
    coords.push(...toMulti(f.geometry).coordinates);
  }
  return { type: "MultiPolygon", coordinates: coords };
}

/** Unwrap longitudes so a ring is continuous across ±180°. */
function unwrapRing(ring) {
  const out = [ring[0].slice()];
  for (let i = 1; i < ring.length; i++) {
    let [lon, lat] = ring[i];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, lat]);
  }
  return out;
}

function rewrapRing(ring) {
  return ring.map(([lon, lat]) => {
    let x = lon;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return [x, lat];
  });
}

function splitRingAtLon(ring, cut) {
  const left = [];
  const right = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const c0 = x0 <= cut;
    if (c0) left.push([x0, y0]);
    else right.push([x0, y0]);
    if (c0 !== x1 <= cut) {
      const t = (cut - x0) / (x1 - x0 || 1e-12);
      const y = y0 + (y1 - y0) * t;
      left.push([cut, y]);
      right.push([cut, y]);
    }
  }
  const close = (pts) => {
    if (pts.length < 3) return null;
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) pts.push(f.slice());
    return pts;
  };
  return [close(left), close(right)];
}

/** Sequentially cut a MultiPolygon at longitude meridians (unwrapped). */
function cutMultiAtLons(geom, cuts) {
  let remaining = toMulti(geom).coordinates.map((poly) => ({
    exterior: unwrapRing(poly[0]),
  }));
  const bands = [];
  for (const cut of cuts) {
    const band = [];
    const next = [];
    for (const piece of remaining) {
      const [L, R] = splitRingAtLon(piece.exterior, cut);
      if (L) band.push({ exterior: L });
      if (R) next.push({ exterior: R });
    }
    bands.push(band);
    remaining = next;
  }
  bands.push(remaining);
  return bands.map((band) => ({
    type: "MultiPolygon",
    coordinates: band
      .filter((p) => p.exterior && p.exterior.length >= 4)
      .map((p) => [rewrapRing(p.exterior)]),
  }));
}

function splitUsa() {
  const usa = byName["United States of America"];
  const m = toMulti(usa.geometry);
  const alaska = [];
  const mainland = [];
  for (const poly of m.coordinates) {
    const g = { type: "Polygon", coordinates: poly };
    const b = geoBounds(g);
    const west = b[0][0];
    const north = b[1][1];
    if (west < -129 && north > 50) alaska.push(poly);
    else mainland.push(poly);
  }
  return {
    alaska: { type: "MultiPolygon", coordinates: alaska },
    usa: { type: "MultiPolygon", coordinates: mainland },
  };
}

function splitRussia() {
  const rus = byName["Russia"];
  const [ural, siberia, yakutsk, kamchatka] = cutMultiAtLons(rus.geometry, [
    60, 110, 145,
  ]);
  return { ural, siberia, yakutsk, kamchatka };
}

function splitAustralia() {
  const aus = byName["Australia"];
  const [western_australia, eastern_australia] = cutMultiAtLons(aus.geometry, [
    135,
  ]);
  return { western_australia, eastern_australia };
}

const usaParts = splitUsa();
const rusParts = splitRussia();
const ausParts = splitAustralia();

/** Country feature with overseas territories stripped. */
function metro(name, lonRange, latRange) {
  const f = byName[name];
  if (!f) {
    console.warn("missing", name);
    return null;
  }
  return {
    type: "Feature",
    properties: f.properties,
    geometry: filterMetropole(f.geometry, lonRange, latRange),
  };
}

const DEFS = [
  {
    id: "alaska",
    name: "Alaska",
    continent: "North America",
    geom: usaParts.alaska,
    neighbors: ["canada", "kamchatka"],
    startingOwner: "player",
    coastal: true,
  },
  {
    id: "canada",
    name: "Canada",
    continent: "North America",
    geom: mergeFeatures(must("Canada")),
    neighbors: ["alaska", "usa", "greenland"],
    startingOwner: "player",
    coastal: true,
  },
  {
    id: "usa",
    name: "United States",
    continent: "North America",
    geom: usaParts.usa,
    neighbors: ["canada", "mexico"],
    startingOwner: "player",
    coastal: true,
  },
  {
    id: "mexico",
    name: "Mexico",
    continent: "North America",
    geom: mergeFeatures(must("Mexico")),
    neighbors: ["usa", "central_america"],
    startingOwner: "faction_a",
    coastal: true,
  },
  {
    id: "central_america",
    name: "Central America",
    continent: "North America",
    geom: mergeFeatures(
      must(
        "Guatemala",
        "Belize",
        "Honduras",
        "El Salvador",
        "Nicaragua",
        "Costa Rica",
        "Panama",
        "Cuba",
        "Haiti",
        "Dominican Rep.",
        "Jamaica",
      ),
    ),
    neighbors: ["mexico", "venezuela"],
    startingOwner: "faction_a",
    coastal: true,
  },
  {
    id: "greenland",
    name: "Greenland",
    continent: "North America",
    geom: mergeFeatures(must("Greenland")),
    neighbors: ["canada", "iceland"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "venezuela",
    name: "Gran Colombia",
    continent: "South America",
    geom: mergeFeatures(
      must("Venezuela", "Colombia", "Ecuador", "Guyana", "Suriname"),
    ),
    neighbors: ["central_america", "brazil", "peru"],
    startingOwner: "faction_a",
    coastal: true,
  },
  {
    id: "brazil",
    name: "Brazil",
    continent: "South America",
    geom: mergeFeatures(must("Brazil")),
    neighbors: ["venezuela", "peru", "argentina", "north_africa"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "peru",
    name: "Andes",
    continent: "South America",
    geom: mergeFeatures(must("Peru", "Bolivia", "Chile")),
    neighbors: ["venezuela", "brazil", "argentina"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "argentina",
    name: "Southern Cone",
    continent: "South America",
    geom: mergeFeatures(must("Argentina", "Uruguay", "Paraguay")),
    neighbors: ["peru", "brazil"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "iceland",
    name: "Iceland",
    continent: "Europe",
    geom: mergeFeatures(must("Iceland")),
    neighbors: ["greenland", "britain", "scandinavia"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "britain",
    name: "Britain",
    continent: "Europe",
    geom: mergeFeatures(must("United Kingdom", "Ireland")),
    neighbors: ["iceland", "scandinavia", "western_europe"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "scandinavia",
    name: "Scandinavia",
    continent: "Europe",
    geom: mergeFeatures(
      must(
        "Norway",
        "Sweden",
        "Finland",
        "Denmark",
        "Estonia",
        "Latvia",
        "Lithuania",
      ),
    ),
    neighbors: ["iceland", "britain", "germany", "ukraine", "ural"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "western_europe",
    name: "W. Europe",
    continent: "Europe",
    // Merge then strip overseas territories (e.g. French Guiana)
    geom: filterMetropole(
      mergeByNames([
        "France",
        "Spain",
        "Portugal",
        "Belgium",
        "Netherlands",
        "Luxembourg",
        "Switzerland",
      ]),
      [-10, 12],
      [35, 54],
    ),
    neighbors: ["britain", "germany", "southern_europe", "north_africa"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "germany",
    name: "C. Europe",
    continent: "Europe",
    geom: mergeFeatures(
      must(
        "Germany",
        "Poland",
        "Czechia",
        "Austria",
        "Slovakia",
        "Hungary",
      ),
    ),
    neighbors: [
      "scandinavia",
      "western_europe",
      "southern_europe",
      "ukraine",
    ],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "southern_europe",
    name: "S. Europe",
    continent: "Europe",
    geom: mergeFeatures(
      must(
        "Italy",
        "Greece",
        "Albania",
        "Serbia",
        "Croatia",
        "Bosnia and Herz.",
        "Montenegro",
        "Slovenia",
        "Romania",
        "Bulgaria",
        "Kosovo",
        "Macedonia",
      ),
    ),
    neighbors: [
      "western_europe",
      "germany",
      "ukraine",
      "egypt",
      "middle_east",
      "north_africa",
    ],
    startingOwner: "faction_a",
    coastal: true,
  },
  {
    id: "ukraine",
    name: "E. Europe",
    continent: "Europe",
    geom: mergeFeatures(must("Ukraine", "Belarus", "Moldova")),
    neighbors: [
      "scandinavia",
      "germany",
      "southern_europe",
      "ural",
      "middle_east",
      "central_asia",
    ],
    startingOwner: "faction_a",
    coastal: false,
  },
  {
    id: "north_africa",
    name: "North Africa",
    continent: "Africa",
    geom: mergeFeatures(
      must(
        "Morocco",
        "Algeria",
        "Tunisia",
        "Libya",
        "W. Sahara",
        "Mauritania",
        "Mali",
        "Niger",
        "Chad",
      ),
    ),
    neighbors: [
      "western_europe",
      "southern_europe",
      "egypt",
      "west_africa",
      "congo",
      "brazil",
    ],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "egypt",
    name: "Egypt",
    continent: "Africa",
    geom: mergeFeatures(must("Egypt", "Sudan")),
    neighbors: [
      "southern_europe",
      "north_africa",
      "east_africa",
      "middle_east",
    ],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "west_africa",
    name: "West Africa",
    continent: "Africa",
    geom: mergeFeatures(
      must(
        "Nigeria",
        "Ghana",
        "Côte d'Ivoire",
        "Senegal",
        "Guinea",
        "Burkina Faso",
        "Benin",
        "Togo",
        "Sierra Leone",
        "Liberia",
        "Guinea-Bissau",
        "Gambia",
      ),
    ),
    neighbors: ["north_africa", "congo"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "congo",
    name: "Congo Basin",
    continent: "Africa",
    geom: mergeFeatures(
      must(
        "Dem. Rep. Congo",
        "Congo",
        "Cameroon",
        "Central African Rep.",
        "Gabon",
        "Eq. Guinea",
        "Angola",
      ),
    ),
    neighbors: ["north_africa", "west_africa", "east_africa", "south_africa"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "east_africa",
    name: "East Africa",
    continent: "Africa",
    geom: mergeFeatures(
      must(
        "Ethiopia",
        "Kenya",
        "Tanzania",
        "Somalia",
        "Uganda",
        "Rwanda",
        "Burundi",
        "Eritrea",
        "Djibouti",
      ),
    ),
    neighbors: ["egypt", "congo", "south_africa", "middle_east"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "south_africa",
    name: "Southern Africa",
    continent: "Africa",
    geom: mergeFeatures(
      must(
        "South Africa",
        "Namibia",
        "Botswana",
        "Zimbabwe",
        "Mozambique",
        "Zambia",
        "Malawi",
        "eSwatini",
        "Lesotho",
      ),
    ),
    neighbors: ["congo", "east_africa"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "middle_east",
    name: "Middle East",
    continent: "Asia",
    geom: mergeFeatures(
      must(
        "Turkey",
        "Syria",
        "Iraq",
        "Iran",
        "Saudi Arabia",
        "Yemen",
        "Oman",
        "United Arab Emirates",
        "Qatar",
        "Kuwait",
        "Jordan",
        "Israel",
        "Lebanon",
        "Palestine",
        "Cyprus",
        "Georgia",
        "Armenia",
        "Azerbaijan",
      ),
    ),
    neighbors: [
      "southern_europe",
      "ukraine",
      "egypt",
      "east_africa",
      "central_asia",
      "india",
    ],
    startingOwner: "faction_a",
    coastal: true,
  },
  {
    id: "central_asia",
    name: "Central Asia",
    continent: "Asia",
    geom: mergeFeatures(
      must(
        "Afghanistan",
        "Pakistan",
        "Kazakhstan",
        "Uzbekistan",
        "Turkmenistan",
        "Kyrgyzstan",
        "Tajikistan",
      ),
    ),
    neighbors: ["ukraine", "ural", "siberia", "china", "india", "middle_east"],
    startingOwner: "faction_a",
    coastal: false,
  },
  {
    id: "ural",
    name: "W. Russia",
    continent: "Asia",
    geom: rusParts.ural,
    neighbors: ["scandinavia", "ukraine", "siberia", "central_asia"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "siberia",
    name: "Siberia",
    continent: "Asia",
    geom: rusParts.siberia,
    neighbors: ["ural", "yakutsk", "mongolia", "china", "central_asia"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "yakutsk",
    name: "Yakutia",
    continent: "Asia",
    geom: rusParts.yakutsk,
    neighbors: ["siberia", "kamchatka", "mongolia", "china"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "kamchatka",
    name: "Far East",
    continent: "Asia",
    geom: rusParts.kamchatka,
    neighbors: ["yakutsk", "japan", "alaska"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "mongolia",
    name: "Mongolia",
    continent: "Asia",
    geom: mergeFeatures(must("Mongolia")),
    neighbors: ["siberia", "yakutsk", "china"],
    startingOwner: "faction_a",
    coastal: false,
  },
  {
    id: "china",
    name: "China",
    continent: "Asia",
    geom: mergeFeatures(must("China", "Taiwan")),
    neighbors: [
      "central_asia",
      "siberia",
      "yakutsk",
      "mongolia",
      "india",
      "southeast_asia",
      "korea",
    ],
    startingOwner: "faction_a",
    coastal: true,
  },
  {
    id: "india",
    name: "India",
    continent: "Asia",
    geom: mergeFeatures(
      must("India", "Bangladesh", "Sri Lanka", "Nepal", "Bhutan"),
    ),
    neighbors: ["middle_east", "central_asia", "china", "southeast_asia"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "southeast_asia",
    name: "SE Asia",
    continent: "Asia",
    geom: mergeFeatures(
      must(
        "Myanmar",
        "Thailand",
        "Vietnam",
        "Laos",
        "Cambodia",
        "Malaysia",
        "Philippines",
        "Brunei",
      ),
    ),
    neighbors: ["china", "india", "indonesia"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "korea",
    name: "Korea",
    continent: "Asia",
    geom: mergeFeatures(must("North Korea", "South Korea")),
    neighbors: ["china", "japan"],
    startingOwner: "faction_a",
    coastal: true,
  },
  {
    id: "japan",
    name: "Japan",
    continent: "Asia",
    geom: mergeFeatures(must("Japan")),
    neighbors: ["kamchatka", "korea", "china"],
    startingOwner: "faction_b",
    coastal: true,
  },
  {
    id: "indonesia",
    name: "Indonesia",
    continent: "Australia",
    geom: mergeFeatures(must("Indonesia", "Timor-Leste")),
    neighbors: ["southeast_asia", "new_guinea", "western_australia"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "new_guinea",
    name: "New Guinea",
    continent: "Australia",
    geom: mergeFeatures(must("Papua New Guinea", "Solomon Is.", "Fiji")),
    neighbors: ["indonesia", "eastern_australia"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "western_australia",
    name: "W. Australia",
    continent: "Australia",
    geom: ausParts.western_australia,
    neighbors: ["indonesia", "eastern_australia"],
    startingOwner: "faction_c",
    coastal: true,
  },
  {
    id: "eastern_australia",
    name: "E. Australia",
    continent: "Australia",
    geom: ausParts.eastern_australia,
    neighbors: ["new_guinea", "western_australia"],
    startingOwner: "faction_c",
    coastal: true,
  },
];

const projection = geoEquirectangular()
  .scale(OUT_W / (2 * Math.PI))
  .translate([OUT_W / 2, OUT_H / 2])
  .precision(0.35);
const pathGen = geoPath(projection);

function pathFromGeom(geom) {
  if (!geom) return "";
  return pathGen(geom) || "";
}

function labelFor(geom) {
  try {
    const c = pathGen.centroid(geom);
    if (!c || Number.isNaN(c[0])) throw new Error("bad centroid");
    // Prefer largest polygon centroid if multipoly centroid looks off-map
    if (c[0] < 0 || c[0] > OUT_W || c[1] < 0 || c[1] > OUT_H) {
      throw new Error("oob");
    }
    return { x: Math.round(c[0] * 10) / 10, y: Math.round(c[1] * 10) / 10 };
  } catch {
    // Fallback: largest-area polygon
    const m = toMulti(geom);
    let best = null;
    let bestA = -1;
    for (const poly of m.coordinates) {
      const g = { type: "Polygon", coordinates: poly };
      const a = geoArea(g);
      if (a > bestA) {
        bestA = a;
        best = g;
      }
    }
    const c = best ? pathGen.centroid(best) : [OUT_W / 2, OUT_H / 2];
    return {
      x: Math.round(c[0] * 10) / 10,
      y: Math.round(c[1] * 10) / 10,
    };
  }
}

const territories = [];
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
  territories.push({
    id: d.id,
    name: d.name,
    continent: d.continent,
    path,
    label: labelFor(d.geom),
    neighbors: d.neighbors,
    startingOwner: d.startingOwner,
    coastal: d.coastal,
  });
}

console.log("territories:", territories.length);
for (const id of [
  "alaska",
  "britain",
  "western_europe",
  "brazil",
  "egypt",
  "china",
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

const seaRoutes = [
  { from: "alaska", to: "kamchatka" },
  { from: "greenland", to: "iceland" },
  { from: "brazil", to: "north_africa" },
  { from: "britain", to: "iceland" },
  { from: "japan", to: "kamchatka" },
  { from: "indonesia", to: "western_australia" },
  { from: "southern_europe", to: "north_africa" },
  { from: "central_america", to: "venezuela" },
];

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
