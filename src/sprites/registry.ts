/**
 * Maps sprite ids from building/unit defs to public `/sprites/...` URLs.
 * Directional sheets: `<id>-dirs.png` horizontal strips (N × 256).
 */

import { DEFAULT_DIRECTIONS } from "./facing";

const ALIASES: Record<string, string> = {
  "building-supply-depot": "buildings/building-supply.png",
  "building-fusion-foundry": "buildings/building-fabricator.png",
  "building-missile-battery": "buildings/building-missile.png",
  "building-emp-tower": "buildings/building-emp.png",
  "building-coastal-battery": "buildings/building-coastal.png",
  "building-shield-generator": "buildings/building-shield-gen.png",
  "building-research-lab": "buildings/building-lab.png",
  "building-cyber-ops": "buildings/building-cyber.png",
  "building-silo-pad": "buildings/building-silo.png",
  "building-repair-bay": "buildings/building-repair.png",
  "building-ammo-factory": "buildings/building-supply.png",
  "building-sensor-dome": "buildings/building-sonar.png",
  "building-barracks": "buildings/building-war-college.png",
  "building-vehicle-factory": "buildings/building-fabricator.png",
  "building-airfield": "buildings/building-uplink.png",

  "unit-power-trooper": "units/unit-power-trooper.png",
  "unit-heavy-walker": "units/unit-walker.png",
  "unit-stealth-op": "units/unit-stealth.png",
  "unit-cyber-commando": "units/unit-commando.png",
  "unit-shield-tank": "units/unit-hover.png",
  "unit-spider-mech": "units/unit-spider.png",
  "unit-siege-mech": "units/unit-siege-mech.png",
  "unit-plasma-howitzer": "units/unit-howitzer.png",
  "unit-cruise-launcher": "units/unit-siege.png",
  "unit-stealth-bomber": "units/unit-bomber.png",
  "unit-assault-dropship": "units/unit-dropship.png",
  "unit-carrier-barge": "units/unit-destroyer.png",
  "unit-torpedo-boat": "units/unit-hydrofoil.png",
  "unit-orbital-laser": "units/unit-orbital.png",
  "unit-kinetic-rod": "units/unit-orbital.png",
  "unit-sat-relay": "units/unit-orbital.png",
  "unit-virus-probe": "units/unit-commando.png",
  "unit-data-spike": "units/unit-ew-drone.png",

  // Expansion set — prefer baked PNGs when present; aliases cover gaps
  "unit-jumpjet": "units/unit-jumpjet.png",
  "unit-rail-walker": "units/unit-rail-walker.png",
  "unit-emp-disruptor": "units/unit-emp-disruptor.png",
  "unit-heavy-siege": "units/unit-heavy-siege.png",
  "unit-recon-drone": "units/unit-recon-drone.png",
  "unit-aa-tank": "units/unit-aa-tank.png",
  "unit-airlift": "units/unit-airlift.png",
  "unit-orbital-uplink": "units/unit-orbital-uplink.png",
  "unit-elite-commando": "units/unit-elite-commando.png",
};

/** Sprite ids that rotate to face targets (turrets / all units). */
const DIRECTION_COUNTS: Record<string, number> = {
  // Units — 8 dirs
  "unit-trooper": 8,
  "unit-power-trooper": 8,
  "unit-mech": 8,
  "unit-walker": 8,
  "unit-heavy-walker": 8,
  "unit-siege-mech": 8,
  "unit-spider": 8,
  "unit-spider-mech": 8,
  "unit-hover": 8,
  "unit-shield-tank": 8,
  "unit-rail-tank": 8,
  "unit-siege": 8,
  "unit-howitzer": 8,
  "unit-plasma-howitzer": 8,
  "unit-cruise-launcher": 8,
  "unit-drone": 8,
  "unit-ew-drone": 8,
  "unit-gunship": 8,
  "unit-bomber": 8,
  "unit-stealth-bomber": 8,
  "unit-interceptor": 8,
  "unit-dropship": 8,
  "unit-assault-dropship": 8,
  "unit-commando": 8,
  "unit-cyber-commando": 8,
  "unit-stealth": 8,
  "unit-stealth-op": 8,
  "unit-destroyer": 8,
  "unit-carrier-barge": 8,
  "unit-hydrofoil": 8,
  "unit-torpedo-boat": 8,
  "unit-submarine": 8,
  "unit-orbital": 8,
  "unit-orbital-laser": 8,
  "unit-kinetic-rod": 8,
  "unit-sat-relay": 8,
  "unit-virus-probe": 8,
  "unit-data-spike": 8,
  "unit-jumpjet": 8,
  "unit-rail-walker": 8,
  "unit-emp-disruptor": 8,
  "unit-heavy-siege": 8,
  "unit-recon-drone": 8,
  "unit-aa-tank": 8,
  "unit-airlift": 8,
  "unit-orbital-uplink": 8,
  "unit-elite-commando": 8,
  // Rotating defense turrets
  "building-laser": 8,
  "building-flak": 8,
  "building-plasma": 8,
  "building-railgun": 8,
  "building-emp": 8,
  "building-emp-tower": 8,
  "building-point-defense": 8,
  "building-coastal": 8,
  "building-coastal-battery": 8,
  "building-missile": 8,
  "building-missile-battery": 8,
};

const PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <rect width="48" height="48" rx="2" fill="#1a2330" stroke="#3d6a7a" stroke-width="1.5"/>
      <path d="M12 34 L24 12 L36 34 Z" fill="#7eb6c9" opacity="0.55"/>
    </svg>`,
  );

function defaultPath(id: string): string {
  if (id.startsWith("building-")) return `buildings/${id}.png`;
  if (id.startsWith("unit-")) return `units/${id}.png`;
  if (id.startsWith("fx-")) return `effects/${id}.png`;
  return `${id}.png`;
}

function resolveRelative(id: string): string {
  return ALIASES[id] ?? defaultPath(id);
}

/** Public asset base (respects Vite `base` for GitHub Pages). */
function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const trimmed = path.replace(/^\//, "");
  return `${base}${trimmed}`;
}

/** Resolve a sprite id to a public URL under `/sprites/`. */
export function getSpriteUrl(id: string): string {
  if (!id) return PLACEHOLDER;
  return assetUrl(`sprites/${resolveRelative(id)}`);
}

/** Directional sheet URL (`…-dirs.png`), or null if single-facing. */
export function getDirectionalSheetUrl(id: string): string | null {
  if (!id || getDirectionCount(id) <= 1) return null;
  const rel = resolveRelative(id);
  return assetUrl(`sprites/${rel.replace(/\.png$/, "-dirs.png")}`);
}

export function getDirectionCount(id: string): number {
  if (!id) return 1;
  if (DIRECTION_COUNTS[id] != null) return DIRECTION_COUNTS[id]!;
  const rel = resolveRelative(id);
  const base = rel.split("/").pop()?.replace(/\.png$/, "") ?? id;
  if (DIRECTION_COUNTS[base] != null) return DIRECTION_COUNTS[base]!;
  if (id.startsWith("unit-")) return DEFAULT_DIRECTIONS;
  return 1;
}

export function getPlaceholderSpriteUrl(): string {
  return PLACEHOLDER;
}
