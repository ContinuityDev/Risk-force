/**
 * Emits non-overlapping territory polygons that partition stylized continents.
 * Run: node scripts/gen-earth-map.mjs
 */
import fs from "node:fs";

// Helper: build a simple rectangular-ish region from corner points
function poly(pts) {
  return "M " + pts.map(([x, y]) => `${x},${y}`).join(" L ") + " Z";
}

const territories = [
  // NA partitions of silhouette roughly (50-330, 50-310)
  { id: "alaska", name: "Alaska", continent: "North America", pts: [[55,70],[120,50],[155,75],[140,120],[90,135],[55,110]], label: [105,90], neighbors: ["northwest","kamchatka"], startingOwner: "player", coastal: true },
  { id: "northwest", name: "Northwest", continent: "North America", pts: [[155,75],[215,60],[245,110],[210,155],[145,145],[140,120]], label: [185,105], neighbors: ["alaska","ontario","california"], startingOwner: "player", coastal: true },
  { id: "ontario", name: "Ontario", continent: "North America", pts: [[215,60],[285,70],[305,125],[265,160],[210,155],[245,110]], label: [250,115], neighbors: ["northwest","quebec","california","greenland"], startingOwner: "faction_a", coastal: true },
  { id: "quebec", name: "Quebec", continent: "North America", pts: [[285,70],[340,85],[345,140],[305,165],[265,160],[305,125]], label: [310,120], neighbors: ["ontario","greenland","iceland"], startingOwner: "faction_a", coastal: true },
  { id: "california", name: "California", continent: "North America", pts: [[145,145],[210,155],[220,215],[180,250],[125,225],[120,175]], label: [165,195], neighbors: ["northwest","ontario","mexico"], startingOwner: "player", coastal: true },
  { id: "mexico", name: "Mexico", continent: "North America", pts: [[125,225],[180,250],[200,290],[155,315],[110,285],[105,245]], label: [145,265], neighbors: ["california","venezuela"], startingOwner: "faction_a", coastal: true },
  { id: "greenland", name: "Greenland", continent: "North America", pts: [[355,35],[430,30],[460,65],[445,105],[385,110],[350,75]], label: [400,65], neighbors: ["ontario","quebec","iceland"], startingOwner: "faction_b", coastal: true },

  // SA
  { id: "venezuela", name: "Venezuela", continent: "South America", pts: [[185,320],[255,310],[280,360],[230,380],[185,355]], label: [230,345], neighbors: ["mexico","brazil","peru"], startingOwner: "faction_a", coastal: true },
  { id: "peru", name: "Peru", continent: "South America", pts: [[185,355],[230,380],[235,440],[195,460],[170,410]], label: [205,410], neighbors: ["venezuela","brazil","argentina"], startingOwner: "faction_c", coastal: true },
  { id: "brazil", name: "Brazil", continent: "South America", pts: [[255,310],[310,335],[320,425],[275,460],[235,440],[230,380],[280,360]], label: [275,385], neighbors: ["venezuela","peru","argentina","north_africa"], startingOwner: "faction_c", coastal: true },
  { id: "argentina", name: "Argentina", continent: "South America", pts: [[195,460],[235,440],[275,460],[270,505],[230,510],[200,485]], label: [235,475], neighbors: ["peru","brazil"], startingOwner: "faction_c", coastal: true },

  // Europe
  { id: "iceland", name: "Iceland", continent: "Europe", pts: [[435,90],[470,82],[480,112],[455,125],[430,112]], label: [452,105], neighbors: ["greenland","quebec","britain","scandinavia"], startingOwner: "faction_b", coastal: true },
  { id: "britain", name: "Britain", continent: "Europe", pts: [[448,138],[485,132],[495,172],[465,185],[440,162]], label: [465,155], neighbors: ["iceland","scandinavia","western_europe"], startingOwner: "faction_b", coastal: true },
  { id: "scandinavia", name: "Scandinavia", continent: "Europe", pts: [[490,70],[550,65],[565,125],[530,145],[485,115],[475,110],[470,82],[490,70]], label: [520,100], neighbors: ["iceland","britain","northern_europe","ukraine"], startingOwner: "faction_b", coastal: true },
  { id: "western_europe", name: "W. Europe", continent: "Europe", pts: [[450,188],[515,180],[530,235],[490,255],[445,235]], label: [485,215], neighbors: ["britain","northern_europe","southern_europe","north_africa"], startingOwner: "faction_b", coastal: true },
  { id: "northern_europe", name: "N. Europe", continent: "Europe", pts: [[530,145],[565,150],[580,200],[540,220],[515,180],[530,145]], label: [545,180], neighbors: ["scandinavia","western_europe","southern_europe","ukraine"], startingOwner: "faction_b", coastal: true },
  { id: "southern_europe", name: "S. Europe", continent: "Europe", pts: [[490,255],[540,220],[580,230],[585,275],[535,295],[490,275]], label: [535,255], neighbors: ["western_europe","northern_europe","ukraine","egypt","middle_east"], startingOwner: "faction_a", coastal: true },
  { id: "ukraine", name: "Ukraine", continent: "Europe", pts: [[565,150],[645,135],[665,200],[615,235],[580,200],[565,150]], label: [610,180], neighbors: ["scandinavia","northern_europe","southern_europe","ural","middle_east","afghanistan"], startingOwner: "faction_a", coastal: false },

  // Africa
  { id: "north_africa", name: "N. Africa", continent: "Africa", pts: [[445,255],[525,245],[550,310],[495,340],[430,320],[425,275]], label: [480,295], neighbors: ["western_europe","egypt","congo","brazil"], startingOwner: "faction_c", coastal: true },
  { id: "egypt", name: "Egypt", continent: "Africa", pts: [[525,245],[580,250],[595,310],[550,330],[550,310],[525,245]], label: [555,285], neighbors: ["southern_europe","north_africa","east_africa","middle_east"], startingOwner: "faction_c", coastal: true },
  { id: "congo", name: "Congo", continent: "Africa", pts: [[430,320],[495,340],[515,405],[465,435],[415,390]], label: [460,375], neighbors: ["north_africa","east_africa","south_africa"], startingOwner: "faction_c", coastal: true },
  { id: "east_africa", name: "E. Africa", continent: "Africa", pts: [[550,330],[595,310],[620,375],[580,425],[515,405],[495,340],[550,330]], label: [560,365], neighbors: ["egypt","congo","south_africa","middle_east"], startingOwner: "faction_c", coastal: true },
  { id: "south_africa", name: "S. Africa", continent: "Africa", pts: [[465,435],[515,405],[580,425],[565,480],[505,490],[455,460]], label: [515,450], neighbors: ["congo","east_africa"], startingOwner: "faction_c", coastal: true },

  // Asia
  { id: "middle_east", name: "Middle East", continent: "Asia", pts: [[585,275],[655,265],[680,320],[630,345],[580,325],[585,275]], label: [625,305], neighbors: ["southern_europe","ukraine","egypt","east_africa","afghanistan","india"], startingOwner: "faction_a", coastal: true },
  { id: "afghanistan", name: "Afghanistan", continent: "Asia", pts: [[645,200],[725,195],[745,250],[690,275],[655,265],[665,200]], label: [695,230], neighbors: ["ukraine","ural","china","india","middle_east"], startingOwner: "faction_a", coastal: false },
  { id: "ural", name: "Ural", continent: "Asia", pts: [[645,135],[735,115],[760,175],[725,195],[645,200],[665,200],[645,135]], label: [695,160], neighbors: ["ukraine","siberia","china","afghanistan"], startingOwner: "faction_b", coastal: false },
  { id: "siberia", name: "Siberia", continent: "Asia", pts: [[735,115],[860,90],[890,150],[825,180],[760,175],[735,115]], label: [805,135], neighbors: ["ural","yakutsk","irkutsk","china","mongolia"], startingOwner: "faction_b", coastal: true },
  { id: "yakutsk", name: "Yakutsk", continent: "Asia", pts: [[860,90],[945,85],[965,140],[905,165],[890,150],[860,90]], label: [910,120], neighbors: ["siberia","kamchatka","irkutsk"], startingOwner: "faction_b", coastal: true },
  { id: "kamchatka", name: "Kamchatka", continent: "Asia", pts: [[945,140],[990,135],[998,185],[960,205],[925,180],[905,165],[945,140]], label: [960,165], neighbors: ["yakutsk","irkutsk","japan","alaska"], startingOwner: "faction_b", coastal: true },
  { id: "irkutsk", name: "Irkutsk", continent: "Asia", pts: [[825,180],[905,165],[925,180],[915,225],[845,235],[805,210],[825,180]], label: [865,200], neighbors: ["siberia","yakutsk","kamchatka","mongolia","japan"], startingOwner: "faction_b", coastal: false },
  { id: "mongolia", name: "Mongolia", continent: "Asia", pts: [[765,210],[845,235],[855,275],[795,290],[745,260],[765,210]], label: [805,250], neighbors: ["siberia","irkutsk","china","japan"], startingOwner: "faction_a", coastal: false },
  { id: "china", name: "China", continent: "Asia", pts: [[725,195],[805,210],[795,290],[745,320],[690,275],[725,195]], label: [750,255], neighbors: ["ural","siberia","mongolia","afghanistan","india","siam","japan"], startingOwner: "faction_a", coastal: true },
  { id: "india", name: "India", continent: "Asia", pts: [[680,320],[745,320],[760,380],[715,400],[665,360],[680,320]], label: [715,355], neighbors: ["middle_east","afghanistan","china","siam"], startingOwner: "faction_c", coastal: true },
  { id: "siam", name: "Siam", continent: "Asia", pts: [[745,320],[795,290],[825,340],[795,375],[760,380],[745,320]], label: [785,340], neighbors: ["china","india","indonesia"], startingOwner: "faction_c", coastal: true },
  { id: "japan", name: "Japan", continent: "Asia", pts: [[905,210],[945,205],[955,250],[925,265],[895,240]], label: [925,235], neighbors: ["kamchatka","irkutsk","mongolia","china"], startingOwner: "faction_b", coastal: true },

  // Australia
  { id: "indonesia", name: "Indonesia", continent: "Australia", pts: [[795,375],[875,365],[895,410],[835,430],[790,410]], label: [840,395], neighbors: ["siam","new_guinea","western_australia"], startingOwner: "faction_c", coastal: true },
  { id: "new_guinea", name: "New Guinea", continent: "Australia", pts: [[895,390],[960,385],[975,425],[925,440],[885,420]], label: [930,410], neighbors: ["indonesia","eastern_australia"], startingOwner: "faction_c", coastal: true },
  { id: "western_australia", name: "W. Australia", continent: "Australia", pts: [[805,435],[875,430],[890,485],[835,500],[795,470]], label: [845,465], neighbors: ["indonesia","eastern_australia"], startingOwner: "faction_c", coastal: true },
  { id: "eastern_australia", name: "E. Australia", continent: "Australia", pts: [[875,430],[935,425],[950,480],[895,495],[890,485],[875,430]], label: [910,460], neighbors: ["new_guinea","western_australia"], startingOwner: "faction_c", coastal: true },
];

let out = `import type { TerritoryDef } from "../types";

/**
 * Risk-style Earth — territories partition stylized continents (viewBox 0 0 1000 520).
 * Generated for adjacent non-overlapping land tiles.
 */
export const TERRITORIES: TerritoryDef[] = [
`;

for (const t of territories) {
  out += `  {
    id: ${JSON.stringify(t.id)},
    name: ${JSON.stringify(t.name)},
    continent: ${JSON.stringify(t.continent)},
    path: ${JSON.stringify(poly(t.pts))},
    label: { x: ${t.label[0]}, y: ${t.label[1]} },
    neighbors: ${JSON.stringify(t.neighbors)},
    startingOwner: ${JSON.stringify(t.startingOwner)},
    coastal: ${t.coastal},
    grid: { cols: 6, rows: 5 },
  },
`;
}

out += `];

export const TERRITORY_BY_ID = Object.fromEntries(
  TERRITORIES.map((t) => [t.id, t]),
) as Record<string, TerritoryDef>;

export function getTerritory(id: string): TerritoryDef {
  const t = TERRITORY_BY_ID[id];
  if (!t) throw new Error(\`Unknown territory: \${id}\`);
  return t;
}
`;

fs.writeFileSync(new URL("../src/data/map/territories.ts", import.meta.url), out);
console.log("wrote", territories.length, "territories");
