/**
 * Maps sprite ids from building/unit defs to public `/sprites/...` URLs.
 * Aliases cover catalog ids that differ slightly from on-disk filenames.
 * Assets are pre-rendered PNG sheets from the three.js sprite lab.
 */

const ALIASES: Record<string, string> = {
  // Buildings
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

  // Units
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

/** Resolve a sprite id to a public URL under `/sprites/`. */
export function getSpriteUrl(id: string): string {
  if (!id) return PLACEHOLDER;
  const relative = ALIASES[id] ?? defaultPath(id);
  return `/sprites/${relative}`;
}

export function getPlaceholderSpriteUrl(): string {
  return PLACEHOLDER;
}
