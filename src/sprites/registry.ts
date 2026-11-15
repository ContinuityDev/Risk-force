/**
 * Maps sprite ids from building/unit defs to public `/sprites/...` URLs.
 * Aliases cover catalog ids that differ slightly from on-disk filenames.
 */

const ALIASES: Record<string, string> = {
  // Buildings
  "building-supply-depot": "buildings/building-supply.svg",
  "building-fusion-foundry": "buildings/building-fabricator.svg",
  "building-missile-battery": "buildings/building-missile.svg",
  "building-emp-tower": "buildings/building-emp.svg",
  "building-coastal-battery": "buildings/building-coastal.svg",
  "building-shield-generator": "buildings/building-shield-gen.svg",
  "building-research-lab": "buildings/building-lab.svg",
  "building-cyber-ops": "buildings/building-cyber.svg",
  "building-silo-pad": "buildings/building-silo.svg",
  "building-repair-bay": "buildings/building-repair.svg",
  "building-ammo-factory": "buildings/building-supply.svg",
  "building-sensor-dome": "buildings/building-sonar.svg",

  // Units
  "unit-power-trooper": "units/unit-power-trooper.svg",
  "unit-heavy-walker": "units/unit-walker.svg",
  "unit-stealth-op": "units/unit-stealth.svg",
  "unit-cyber-commando": "units/unit-commando.svg",
  "unit-shield-tank": "units/unit-hover.svg",
  "unit-spider-mech": "units/unit-spider.svg",
  "unit-siege-mech": "units/unit-siege-mech.svg",
  "unit-plasma-howitzer": "units/unit-howitzer.svg",
  "unit-cruise-launcher": "units/unit-siege.svg",
  "unit-stealth-bomber": "units/unit-bomber.svg",
  "unit-assault-dropship": "units/unit-dropship.svg",
  "unit-carrier-barge": "units/unit-destroyer.svg",
  "unit-torpedo-boat": "units/unit-hydrofoil.svg",
  "unit-orbital-laser": "units/unit-orbital.svg",
  "unit-kinetic-rod": "units/unit-orbital.svg",
  "unit-sat-relay": "units/unit-orbital.svg",
  "unit-virus-probe": "units/unit-commando.svg",
  "unit-data-spike": "units/unit-ew-drone.svg",
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
  if (id.startsWith("building-")) return `buildings/${id}.svg`;
  if (id.startsWith("unit-")) return `units/${id}.svg`;
  if (id.startsWith("fx-")) return `effects/${id}.svg`;
  return `${id}.svg`;
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
