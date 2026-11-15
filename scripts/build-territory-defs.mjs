/**
 * Builds ~90–110 territory definitions from Natural Earth countries.
 * Large nations are split; microstates merge into hosts.
 * Neighbors from TopoJSON shared arcs + explicit sea links.
 */
import { geoArea, geoBounds } from "d3-geo";
import { feature, merge as topoMerge } from "topojson-client";

const SKIP = new Set([
  "Antarctica",
  "Fr. S. Antarctic Lands",
  "N. Cyprus",
  "Somaliland",
  "Falkland Is.",
  "New Caledonia",
  "Puerto Rico",
  "Vanuatu",
  "Trinidad and Tobago",
  "Bahamas",
]);

/** Tiny → host country name (Natural Earth). */
const MERGE_INTO = {
  Luxembourg: "Belgium",
  Liechtenstein: "Switzerland",
  Andorra: "Spain",
  Monaco: "France",
  "San Marino": "Italy",
  Malta: "Italy",
  Vatican: "Italy",
  Kosovo: "Serbia",
  Montenegro: "Serbia",
  Macedonia: "Serbia",
  Albania: "Serbia",
  "Bosnia and Herz.": "Croatia",
  Slovenia: "Croatia",
  Slovakia: "Czechia",
  Moldova: "Ukraine",
  Belarus: "Ukraine",
  Estonia: "Latvia",
  Lithuania: "Latvia",
  Armenia: "Georgia",
  Azerbaijan: "Georgia",
  Cyprus: "Turkey",
  Palestine: "Israel",
  Lebanon: "Syria",
  Jordan: "Syria",
  Kuwait: "Iraq",
  Qatar: "United Arab Emirates",
  Bahrain: "United Arab Emirates",
  Bhutan: "Nepal",
  Brunei: "Malaysia",
  "Timor-Leste": "Indonesia",
  "Eq. Guinea": "Gabon",
  "Gambia": "Senegal",
  "Guinea-Bissau": "Guinea",
  "Sierra Leone": "Liberia",
  Togo: "Benin",
  "Burkina Faso": "Mali",
  Rwanda: "Uganda",
  Burundi: "Uganda",
  Djibouti: "Ethiopia",
  Eritrea: "Ethiopia",
  Lesotho: "South Africa",
  eSwatini: "South Africa",
  Malawi: "Zambia",
  Belize: "Guatemala",
  "El Salvador": "Honduras",
  "Costa Rica": "Nicaragua",
  Panama: "Colombia",
  Guyana: "Venezuela",
  Suriname: "Venezuela",
  Uruguay: "Argentina",
  Paraguay: "Argentina",
  Jamaica: "Cuba",
  Haiti: "Dominican Rep.",
  Ireland: "United Kingdom",
  "Solomon Is.": "Papua New Guinea",
  Fiji: "Papua New Guinea",
};

const CONTINENT_OF = {
  // North America
  "United States of America": "North America",
  Canada: "North America",
  Mexico: "North America",
  Greenland: "North America",
  Guatemala: "North America",
  Honduras: "North America",
  Nicaragua: "North America",
  Cuba: "North America",
  "Dominican Rep.": "North America",
  // South America
  Colombia: "South America",
  Venezuela: "South America",
  Brazil: "South America",
  Peru: "South America",
  Bolivia: "South America",
  Chile: "South America",
  Argentina: "South America",
  Ecuador: "South America",
  // Europe
  Iceland: "Europe",
  "United Kingdom": "Europe",
  Norway: "Europe",
  Sweden: "Europe",
  Finland: "Europe",
  Denmark: "Europe",
  Latvia: "Europe",
  France: "Europe",
  Spain: "Europe",
  Portugal: "Europe",
  Belgium: "Europe",
  Netherlands: "Europe",
  Switzerland: "Europe",
  Germany: "Europe",
  Poland: "Europe",
  Czechia: "Europe",
  Austria: "Europe",
  Hungary: "Europe",
  Italy: "Europe",
  Greece: "Europe",
  Croatia: "Europe",
  Serbia: "Europe",
  Romania: "Europe",
  Bulgaria: "Europe",
  Ukraine: "Europe",
  // Africa
  Morocco: "Africa",
  Algeria: "Africa",
  Tunisia: "Africa",
  Libya: "Africa",
  "W. Sahara": "Africa",
  Mauritania: "Africa",
  Mali: "Africa",
  Niger: "Africa",
  Chad: "Africa",
  Egypt: "Africa",
  Sudan: "Africa",
  "S. Sudan": "Africa",
  Nigeria: "Africa",
  Ghana: "Africa",
  "Côte d'Ivoire": "Africa",
  Senegal: "Africa",
  Guinea: "Africa",
  Liberia: "Africa",
  Benin: "Africa",
  Cameroon: "Africa",
  "Central African Rep.": "Africa",
  Gabon: "Africa",
  Congo: "Africa",
  "Dem. Rep. Congo": "Africa",
  Angola: "Africa",
  Ethiopia: "Africa",
  Kenya: "Africa",
  Tanzania: "Africa",
  Somalia: "Africa",
  Uganda: "Africa",
  "South Africa": "Africa",
  Namibia: "Africa",
  Botswana: "Africa",
  Zimbabwe: "Africa",
  Mozambique: "Africa",
  Zambia: "Africa",
  Madagascar: "Africa",
  // Asia
  Turkey: "Asia",
  Syria: "Asia",
  Iraq: "Asia",
  Iran: "Asia",
  "Saudi Arabia": "Asia",
  Yemen: "Asia",
  Oman: "Asia",
  "United Arab Emirates": "Asia",
  Israel: "Asia",
  Georgia: "Asia",
  Afghanistan: "Asia",
  Pakistan: "Asia",
  Kazakhstan: "Asia",
  Uzbekistan: "Asia",
  Turkmenistan: "Asia",
  Kyrgyzstan: "Asia",
  Tajikistan: "Asia",
  Russia: "Asia",
  Mongolia: "Asia",
  China: "Asia",
  Taiwan: "Asia",
  India: "Asia",
  Bangladesh: "Asia",
  "Sri Lanka": "Asia",
  Nepal: "Asia",
  Myanmar: "Asia",
  Thailand: "Asia",
  Vietnam: "Asia",
  Laos: "Asia",
  Cambodia: "Asia",
  Malaysia: "Asia",
  Philippines: "Asia",
  "North Korea": "Asia",
  "South Korea": "Asia",
  Japan: "Asia",
  Indonesia: "Asia",
  // Oceania
  Australia: "Oceania",
  "Papua New Guinea": "Oceania",
  "New Zealand": "Oceania",
};

function slug(name) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function toMulti(geom) {
  if (!geom) return { type: "MultiPolygon", coordinates: [] };
  if (geom.type === "Polygon")
    return { type: "MultiPolygon", coordinates: [geom.coordinates] };
  if (geom.type === "MultiPolygon") return geom;
  return { type: "MultiPolygon", coordinates: [] };
}

function flattenArcs(arcs, out = []) {
  if (typeof arcs === "number") out.push(Math.abs(arcs));
  else for (const a of arcs) flattenArcs(a, out);
  return out;
}

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
 * @param {object} topo TopoJSON
 * @param {object} byName name → Feature
 */
export function buildTerritoryDefs(topo, byName) {
  const geoms = topo.objects.countries.geometries;

  // Resolve merge chains to final host
  function hostOf(name) {
    let cur = name;
    const seen = new Set();
    while (MERGE_INTO[cur] && !seen.has(cur)) {
      seen.add(cur);
      cur = MERGE_INTO[cur];
    }
    return cur;
  }

  // Group country names by territory host
  const groups = new Map(); // hostName -> [country names]
  for (const g of geoms) {
    const name = g.properties.name;
    if (SKIP.has(name)) continue;
    if (MERGE_INTO[name] && !byName[hostOf(name)]) continue;
    const host = hostOf(name);
    if (SKIP.has(host)) continue;
    if (!byName[host] && !byName[name]) continue;
    const key = byName[host] ? host : name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }

  function mergeNames(names) {
    const ids = new Set(
      names.map((n) => byName[n]?.id).filter((id) => id != null),
    );
    const g = geoms.filter((x) => ids.has(x.id));
    if (!g.length) return { type: "MultiPolygon", coordinates: [] };
    return toMulti(topoMerge(topo, g));
  }

  function continentFor(name) {
    return CONTINENT_OF[name] ?? CONTINENT_OF[hostOf(name)] ?? "Asia";
  }

  /** @type {Array<{id:string,name:string,continent:string,geom:any,sourceNames:string[],coastal:boolean}>} */
  const pieces = [];

  for (const [host, names] of groups) {
    let geom = mergeNames(names);
    if (host === "France") {
      geom = filterMetropole(geom, [-10, 12], [35, 54]);
    } else if (host === "United Kingdom") {
      geom = filterMetropole(geom, [-15, 5], [48, 62]);
    } else if (host === "Spain") {
      geom = filterMetropole(geom, [-12, 6], [35, 45]);
    } else if (host === "Netherlands") {
      geom = filterMetropole(geom, [2, 8], [50, 54]);
    } else if (host === "Portugal") {
      geom = filterMetropole(geom, [-12, -5], [36, 43]);
    } else if (host === "United States of America") {
      // split later
    } else if (host === "Russia") {
      // split later
    } else if (host === "Australia") {
      // split later
    } else if (host === "Canada") {
      // split later
    } else if (host === "Brazil") {
      // split later
    } else if (host === "China") {
      // split later
    } else if (host === "India") {
      // split later
    }

    if (!toMulti(geom).coordinates.length) continue;

    // Splits for large countries
    if (host === "United States of America") {
      const m = toMulti(geom);
      const alaska = [];
      const mainland = [];
      for (const poly of m.coordinates) {
        const g = { type: "Polygon", coordinates: poly };
        const b = geoBounds(g);
        if (b[0][0] < -129 && b[1][1] > 50) alaska.push(poly);
        else mainland.push(poly);
      }
      const [west, mid, east] = cutMultiAtLons(
        { type: "MultiPolygon", coordinates: mainland },
        [-110, -90],
      );
      pieces.push({
        id: "alaska",
        name: "Alaska",
        continent: "North America",
        geom: { type: "MultiPolygon", coordinates: alaska },
        sourceNames: names,
        coastal: true,
      });
      pieces.push({
        id: "usa_west",
        name: "Western USA",
        continent: "North America",
        geom: west,
        sourceNames: names,
        coastal: true,
      });
      pieces.push({
        id: "usa_central",
        name: "Central USA",
        continent: "North America",
        geom: mid,
        sourceNames: names,
        coastal: false,
      });
      pieces.push({
        id: "usa_east",
        name: "Eastern USA",
        continent: "North America",
        geom: east,
        sourceNames: names,
        coastal: true,
      });
      continue;
    }

    if (host === "Canada") {
      const [west, east] = cutMultiAtLons(geom, [-95]);
      pieces.push({
        id: "canada_west",
        name: "Western Canada",
        continent: "North America",
        geom: west,
        sourceNames: names,
        coastal: true,
      });
      pieces.push({
        id: "canada_east",
        name: "Eastern Canada",
        continent: "North America",
        geom: east,
        sourceNames: names,
        coastal: true,
      });
      continue;
    }

    if (host === "Brazil") {
      const [north, south] = cutMultiAtLons(geom, [-50]);
      // lon cut is vertical; for Brazil use a rough split via lon
      pieces.push({
        id: "brazil_north",
        name: "Northern Brazil",
        continent: "South America",
        geom: north,
        sourceNames: names,
        coastal: true,
      });
      pieces.push({
        id: "brazil_south",
        name: "Southern Brazil",
        continent: "South America",
        geom: south,
        sourceNames: names,
        coastal: true,
      });
      continue;
    }

    if (host === "Russia") {
      const [ural, siberia, yakutsk, kamchatka] = cutMultiAtLons(geom, [
        60, 110, 145,
      ]);
      pieces.push(
        {
          id: "ural",
          name: "W. Russia",
          continent: "Europe",
          geom: ural,
          sourceNames: names,
          coastal: true,
        },
        {
          id: "siberia",
          name: "Siberia",
          continent: "Asia",
          geom: siberia,
          sourceNames: names,
          coastal: true,
        },
        {
          id: "yakutsk",
          name: "Yakutia",
          continent: "Asia",
          geom: yakutsk,
          sourceNames: names,
          coastal: true,
        },
        {
          id: "kamchatka",
          name: "Far East",
          continent: "Asia",
          geom: kamchatka,
          sourceNames: names,
          coastal: true,
        },
      );
      continue;
    }

    if (host === "China") {
      const withTw = mergeNames([...names, "Taiwan"].filter((n) => byName[n]));
      const [west, east] = cutMultiAtLons(withTw, [105]);
      pieces.push(
        {
          id: "china_west",
          name: "Western China",
          continent: "Asia",
          geom: west,
          sourceNames: names,
          coastal: false,
        },
        {
          id: "china_east",
          name: "Eastern China",
          continent: "Asia",
          geom: east,
          sourceNames: names,
          coastal: true,
        },
      );
      continue;
    }

    if (host === "India") {
      const [west, east] = cutMultiAtLons(geom, [80]);
      pieces.push(
        {
          id: "india_west",
          name: "Western India",
          continent: "Asia",
          geom: west,
          sourceNames: names,
          coastal: true,
        },
        {
          id: "india_east",
          name: "Eastern India",
          continent: "Asia",
          geom: east,
          sourceNames: names,
          coastal: true,
        },
      );
      continue;
    }

    if (host === "Australia") {
      const [western, eastern] = cutMultiAtLons(geom, [135]);
      pieces.push(
        {
          id: "western_australia",
          name: "W. Australia",
          continent: "Oceania",
          geom: western,
          sourceNames: names,
          coastal: true,
        },
        {
          id: "eastern_australia",
          name: "E. Australia",
          continent: "Oceania",
          geom: eastern,
          sourceNames: names,
          coastal: true,
        },
      );
      continue;
    }

    // Skip Taiwan if merged into China
    if (host === "Taiwan") continue;

    const id = slug(host);
    const nice = host
      .replace("United States of America", "United States")
      .replace("Dem. Rep. Congo", "DR Congo")
      .replace("Central African Rep.", "C. African Rep.")
      .replace("Dominican Rep.", "Dominican Rep.")
      .replace("United Kingdom", "Britain")
      .replace("United Arab Emirates", "UAE")
      .replace("Papua New Guinea", "New Guinea")
      .replace("South Korea", "S. Korea")
      .replace("North Korea", "N. Korea")
      .replace("Saudi Arabia", "Saudi Arabia")
      .replace("W. Sahara", "W. Sahara");

    pieces.push({
      id,
      name: nice,
      continent: continentFor(host),
      geom,
      sourceNames: names,
      coastal: true, // refined later via bounds if needed
    });
  }

  // Topo neighbors between source countries → territory neighbors
  const arcOwners = new Map();
  geoms.forEach((g, i) => {
    for (const a of flattenArcs(g.arcs)) {
      if (!arcOwners.has(a)) arcOwners.set(a, []);
      arcOwners.get(a).push(i);
    }
  });
  const countryNeigh = geoms.map(() => new Set());
  for (const ids of arcOwners.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        countryNeigh[ids[i]].add(ids[j]);
        countryNeigh[ids[j]].add(ids[i]);
      }
    }
  }
  const nameToGeomIdx = Object.fromEntries(
    geoms.map((g, i) => [g.properties.name, i]),
  );

  // Map source country → territory id(s)
  const countryToTerr = new Map();
  for (const p of pieces) {
    for (const n of p.sourceNames) {
      if (!countryToTerr.has(n)) countryToTerr.set(n, new Set());
      countryToTerr.get(n).add(p.id);
    }
  }

  const neighborSets = Object.fromEntries(pieces.map((p) => [p.id, new Set()]));

  for (const p of pieces) {
    for (const n of p.sourceNames) {
      const idx = nameToGeomIdx[n];
      if (idx == null) continue;
      for (const j of countryNeigh[idx]) {
        const otherName = geoms[j].properties.name;
        const terrs = countryToTerr.get(otherName);
        if (!terrs) continue;
        for (const tid of terrs) {
          if (tid !== p.id) neighborSets[p.id].add(tid);
        }
      }
    }
  }

  // Intra-split neighbors for cut pieces
  const SPLIT_LINKS = [
    ["alaska", "canada_west"],
    ["alaska", "usa_west"],
    ["usa_west", "usa_central"],
    ["usa_central", "usa_east"],
    ["usa_west", "canada_west"],
    ["usa_central", "canada_west"],
    ["usa_central", "canada_east"],
    ["usa_east", "canada_east"],
    ["canada_west", "canada_east"],
    ["brazil_north", "brazil_south"],
    ["ural", "siberia"],
    ["siberia", "yakutsk"],
    ["yakutsk", "kamchatka"],
    ["china_west", "china_east"],
    ["india_west", "india_east"],
    ["western_australia", "eastern_australia"],
  ];
  for (const [a, b] of SPLIT_LINKS) {
    if (neighborSets[a] && neighborSets[b]) {
      neighborSets[a].add(b);
      neighborSets[b].add(a);
    }
  }

  // Sea links
  const SEA = [
    ["alaska", "kamchatka"],
    ["greenland", "iceland"],
    ["iceland", "united_kingdom"],
    ["united_kingdom", "france"],
    ["united_kingdom", "norway"],
    ["spain", "morocco"],
    ["italy", "tunisia"],
    ["italy", "libya"],
    ["greece", "turkey"],
    ["greece", "egypt"],
    ["brazil_north", "senegal"],
    ["brazil_north", "liberia"],
    ["japan", "kamchatka"],
    ["japan", "south_korea"],
    ["japan", "china_east"],
    ["indonesia", "western_australia"],
    ["indonesia", "philippines"],
    ["papua_new_guinea", "eastern_australia"],
    ["new_zealand", "eastern_australia"],
    ["madagascar", "mozambique"],
    ["cuba", "usa_east"],
    ["usa_east", "united_kingdom"],
    ["sri_lanka", "india_east"],
    ["madagascar", "tanzania"],
  ];
  for (const [a, b] of SEA) {
    if (neighborSets[a] && neighborSets[b]) {
      neighborSets[a].add(b);
      neighborSets[b].add(a);
    }
  }

  // Coastal heuristic: touches ocean if area large or sea-linked / has lon edge
  const idSet = new Set(pieces.map((p) => p.id));
  const defs = pieces
    .filter((p) => toMulti(p.geom).coordinates.length && geoArea(p.geom) > 1e-7)
    .map((p) => {
      const neighbors = [...(neighborSets[p.id] ?? [])].filter((n) =>
        idSet.has(n),
      );
      return {
        id: p.id,
        name: p.name,
        continent: p.continent,
        geom: p.geom,
        neighbors,
        startingOwner: "faction_c",
        coastal: p.coastal !== false,
      };
    });

  return defs;
}

export const SEA_ROUTE_PAIRS = [
  { from: "alaska", to: "kamchatka" },
  { from: "greenland", to: "iceland" },
  { from: "brazil_north", to: "senegal" },
  { from: "united_kingdom", to: "iceland" },
  { from: "japan", to: "kamchatka" },
  { from: "indonesia", to: "western_australia" },
  { from: "italy", to: "tunisia" },
  { from: "cuba", to: "usa_east" },
  { from: "new_zealand", to: "eastern_australia" },
  { from: "spain", to: "morocco" },
];
