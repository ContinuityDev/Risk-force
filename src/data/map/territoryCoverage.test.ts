import { readFileSync } from "node:fs";
import { join } from "node:path";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import { describe, expect, it } from "vitest";
import { buildTerritoryDefs } from "../../../scripts/build-territory-defs.mjs";

const RAW = join(process.cwd(), "src/data/map/raw/countries-110m.json");
const ANTARCTICA = new Set([
  "Antarctica",
  "Fr. S. Antarctic Lands",
  "N. Cyprus",
  "Somaliland",
]);

describe("territory coverage", () => {
  const topo = JSON.parse(readFileSync(RAW, "utf8"));
  const countries = feature(topo, topo.objects.countries).features;
  const byName = Object.fromEntries(
    countries.map((f: { properties: { name: string } }) => [
      f.properties.name,
      f,
    ]),
  );
  const defs = buildTerritoryDefs(topo, byName);

  it("merges Kosovo into Serbia (no dark hole)", () => {
    const serbia = defs.find(
      (d: { name: string }) => d.name === "Serbia",
    );
    expect(serbia).toBeTruthy();
    expect(serbia.sourceNames).toContain("Kosovo");
    // Pristina
    expect(geoContains(serbia.geom, [21.16, 42.66])).toBe(true);
  });

  it("keeps Corsica on France and Sardinia/Sicily on Italy", () => {
    const france = defs.find(
      (d: { name: string }) => d.name === "France",
    );
    const italy = defs.find((d: { name: string }) => d.name === "Italy");
    expect(france).toBeTruthy();
    expect(italy).toBeTruthy();
    expect(geoContains(france.geom, [9.0, 42.2])).toBe(true); // Corsica
    expect(geoContains(italy.geom, [9.0, 40.1])).toBe(true); // Sardinia
    expect(geoContains(italy.geom, [14.0, 37.5])).toBe(true); // Sicily
  });

  it("assigns every non-Antarctica Natural Earth feature to a territory", () => {
    const covered = new Set<string>();
    for (const d of defs) {
      for (const n of d.sourceNames ?? []) covered.add(n);
    }
    const missing: string[] = [];
    for (const f of countries) {
      const name = f.properties.name as string;
      if (ANTARCTICA.has(name)) continue;
      if (!covered.has(name)) missing.push(name);
    }
    expect(missing, `unowned land: ${missing.join(", ")}`).toEqual([]);
  });
});
