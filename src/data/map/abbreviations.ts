/** Short labels for dense map zoom. */
const EARTH_OVERRIDES: Record<string, string> = {
  united_kingdom: "Britain",
  usa_west: "W.USA",
  usa_central: "C.USA",
  usa_east: "E.USA",
  canada_west: "W.Can",
  canada_east: "E.Can",
  brazil_north: "N. Brazil",
  brazil_south: "S. Brazil",
  china_west: "W.China",
  china_east: "E.China",
  india_west: "W.India",
  india_east: "E.India",
  western_australia: "W.Aus",
  eastern_australia: "E.Aus",
  dem_rep_congo: "DRC",
  central_african_rep: "CAR",
  united_arab_emirates: "UAE",
  papua_new_guinea: "N.Guinea",
  south_korea: "S.Korea",
  north_korea: "N.Korea",
  saudi_arabia: "Saudi",
};

let MAP_OVERRIDES: Record<string, string> | null = null;

export function setAbbrevOverrides(next: Record<string, string> | null): void {
  MAP_OVERRIDES = next;
}

export function territoryAbbrev(id: string, name: string): string {
  if (MAP_OVERRIDES?.[id]) return MAP_OVERRIDES[id]!;
  if (EARTH_OVERRIDES[id]) return EARTH_OVERRIDES[id]!;
  if (name.length <= 11) return name;
  const parts = name.replace(/\./g, "").split(/\s+/);
  if (parts.length >= 2) return parts.map((p) => p[0]).join(".") + ".";
  return name.slice(0, 9) + "…";
}
