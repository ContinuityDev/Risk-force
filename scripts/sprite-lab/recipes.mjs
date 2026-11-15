/**
 * Data-driven 3D model recipes for Risk Force units & buildings.
 * Consumed by the headless three.js sprite renderer.
 */

export const PALETTES = {
  olive: { hull: 0x6a7850, dark: 0x3a4430, accent: 0x8a9870, metal: 0x7a858e, trim: 0xd4b484 },
  desert: { hull: 0xb0a078, dark: 0x5a5040, accent: 0xc8b888, metal: 0x8a9098, trim: 0xe4d0a0 },
  urban: { hull: 0x7a828a, dark: 0x3a424a, accent: 0xa0a8b0, metal: 0x9098a0, trim: 0x9ec8d8 },
  navy: { hull: 0x5a6a7c, dark: 0x2a3440, accent: 0x7a90a8, metal: 0x808890, trim: 0xb8e0ec },
};

/** Default facing frames for mobile units / rotating turrets. */
export const DEFAULT_DIRECTIONS = 8;

/** @type {Record<string, { kind: string; palette: string; scale?: number; file: string; directions?: number }>} */
export const UNIT_RECIPES = {
  "unit-trooper": { kind: "infantry", palette: "olive", file: "units/unit-trooper.png", directions: 8 },
  "unit-power-trooper": { kind: "infantry", palette: "urban", file: "units/unit-power-trooper.png", elite: true, directions: 8 },
  "unit-mech": { kind: "mech", palette: "olive", file: "units/unit-mech.png", scale: 1.15, directions: 8 },
  "unit-walker": { kind: "mech", palette: "desert", file: "units/unit-walker.png", scale: 1.05, directions: 8 },
  "unit-siege-mech": { kind: "mech", palette: "desert", file: "units/unit-siege-mech.png", scale: 1.3, heavy: true, directions: 8 },
  "unit-spider": { kind: "spider", palette: "urban", file: "units/unit-spider.png", directions: 8 },
  "unit-hover": { kind: "hover", palette: "olive", file: "units/unit-hover.png", directions: 8, turreted: true },
  "unit-rail-tank": { kind: "tank", palette: "desert", file: "units/unit-rail-tank.png", rail: true, directions: 8, turreted: true },
  "unit-siege": { kind: "arty", palette: "desert", file: "units/unit-siege.png", directions: 8, turreted: true },
  "unit-howitzer": { kind: "arty", palette: "olive", file: "units/unit-howitzer.png", directions: 8, turreted: true },
  "unit-drone": { kind: "drone", palette: "urban", file: "units/unit-drone.png", directions: 8 },
  "unit-ew-drone": { kind: "drone", palette: "navy", file: "units/unit-ew-drone.png", ew: true, directions: 8 },
  "unit-gunship": { kind: "aircraft", palette: "olive", file: "units/unit-gunship.png", directions: 8 },
  "unit-bomber": { kind: "aircraft", palette: "urban", file: "units/unit-bomber.png", wide: true, directions: 8 },
  "unit-interceptor": { kind: "aircraft", palette: "navy", file: "units/unit-interceptor.png", directions: 8 },
  "unit-dropship": { kind: "aircraft", palette: "desert", file: "units/unit-dropship.png", wide: true, directions: 8 },
  "unit-commando": { kind: "infantry", palette: "urban", file: "units/unit-commando.png", stealth: true, directions: 8 },
  "unit-stealth": { kind: "infantry", palette: "navy", file: "units/unit-stealth.png", stealth: true, directions: 8 },
  "unit-destroyer": { kind: "ship", palette: "navy", file: "units/unit-destroyer.png", directions: 8 },
  "unit-hydrofoil": { kind: "ship", palette: "navy", file: "units/unit-hydrofoil.png", small: true, directions: 8 },
  "unit-submarine": { kind: "sub", palette: "navy", file: "units/unit-submarine.png", directions: 8 },
  "unit-orbital": { kind: "orbital", palette: "urban", file: "units/unit-orbital.png", directions: 8 },

  // Expansion set — distinct silhouettes via builder flags
  "unit-jumpjet": { kind: "infantry", palette: "urban", file: "units/unit-jumpjet.png", jumpjet: true, elite: true, directions: 8 },
  "unit-rail-walker": { kind: "mech", palette: "urban", file: "units/unit-rail-walker.png", scale: 1.25, heavy: true, rail: true, directions: 8 },
  "unit-emp-disruptor": { kind: "hover", palette: "navy", file: "units/unit-emp-disruptor.png", ew: true, directions: 8, turreted: true },
  "unit-heavy-siege": { kind: "mech", palette: "desert", file: "units/unit-heavy-siege.png", scale: 1.35, heavy: true, siege: true, directions: 8 },
  "unit-recon-drone": { kind: "drone", palette: "navy", file: "units/unit-recon-drone.png", stealth: true, ew: true, directions: 8 },
  "unit-aa-tank": { kind: "tank", palette: "olive", file: "units/unit-aa-tank.png", aa: true, directions: 8, turreted: true },
  "unit-airlift": { kind: "aircraft", palette: "desert", file: "units/unit-airlift.png", wide: true, directions: 8 },
  "unit-orbital-uplink": { kind: "orbital", palette: "navy", file: "units/unit-orbital-uplink.png", directions: 8 },
  "unit-elite-commando": { kind: "infantry", palette: "desert", file: "units/unit-elite-commando.png", stealth: true, elite: true, directions: 8 },
};

export const BUILDING_RECIPES = {
  "building-nexus": { kind: "nexus", palette: "urban", file: "buildings/building-nexus.png", directions: 1 },
  "building-reactor": { kind: "reactor", palette: "urban", file: "buildings/building-reactor.png", directions: 1 },
  "building-refinery": { kind: "refinery", palette: "desert", file: "buildings/building-refinery.png", directions: 1 },
  "building-laser": { kind: "turret", palette: "olive", file: "buildings/building-laser.png", directions: 8 },
  "building-missile": { kind: "missile", palette: "olive", file: "buildings/building-missile.png", directions: 8 },
  "building-shield": { kind: "pylon", palette: "navy", file: "buildings/building-shield.png", directions: 1 },
  "building-shield-gen": { kind: "pylon", palette: "navy", file: "buildings/building-shield-gen.png", directions: 1 },
  "building-supply": { kind: "depot", palette: "desert", file: "buildings/building-supply.png", directions: 1 },
  "building-fabricator": { kind: "factory", palette: "urban", file: "buildings/building-fabricator.png", directions: 1 },
  "building-lab": { kind: "lab", palette: "urban", file: "buildings/building-lab.png", directions: 1 },
  "building-flak": { kind: "turret", palette: "desert", file: "buildings/building-flak.png", directions: 8 },
  "building-plasma": { kind: "turret", palette: "navy", file: "buildings/building-plasma.png", directions: 8 },
  "building-railgun": { kind: "turret", palette: "urban", file: "buildings/building-railgun.png", rail: true, directions: 8 },
  "building-emp": { kind: "turret", palette: "navy", file: "buildings/building-emp.png", directions: 8 },
  "building-point-defense": { kind: "turret", palette: "olive", file: "buildings/building-point-defense.png", directions: 8 },
  "building-coastal": { kind: "turret", palette: "navy", file: "buildings/building-coastal.png", directions: 8 },
  "building-geothermal": { kind: "plant", palette: "desert", file: "buildings/building-geothermal.png", directions: 1 },
  "building-jammer": { kind: "tower", palette: "urban", file: "buildings/building-jammer.png", directions: 1 },
  "building-sonar": { kind: "tower", palette: "navy", file: "buildings/building-sonar.png", directions: 1 },
  "building-uplink": { kind: "tower", palette: "urban", file: "buildings/building-uplink.png", directions: 1 },
  "building-silo": { kind: "silo", palette: "desert", file: "buildings/building-silo.png", directions: 1 },
  "building-drydock": { kind: "dock", palette: "navy", file: "buildings/building-drydock.png", directions: 1 },
  "building-repair": { kind: "factory", palette: "olive", file: "buildings/building-repair.png", directions: 1 },
  "building-orbital-collector": { kind: "orbital_pad", palette: "urban", file: "buildings/building-orbital-collector.png", directions: 1 },
  "building-dark-matter": { kind: "orbital_pad", palette: "navy", file: "buildings/building-dark-matter.png", exotic: true, directions: 1 },
  "building-cyber": { kind: "lab", palette: "navy", file: "buildings/building-cyber.png", directions: 1 },
  "building-war-college": { kind: "lab", palette: "olive", file: "buildings/building-war-college.png", directions: 1 },
};

export const FX_RECIPES = {
  "fx-explosion": { kind: "explosion", file: "effects/fx-explosion.png", directions: 1 },
  "fx-smoke": { kind: "smoke", file: "effects/fx-smoke.png", directions: 1 },
  "fx-muzzle": { kind: "muzzle", file: "effects/fx-muzzle.png", directions: 1 },
  "fx-wreck": { kind: "wreck", file: "effects/fx-wreck.png", directions: 1 },
  "fx-emp": { kind: "emp", file: "effects/fx-emp.png", directions: 1 },
  "fx-laser": { kind: "beam", file: "effects/fx-laser.png", directions: 1 },
  "fx-plasma": { kind: "bolt", file: "effects/fx-plasma.png", directions: 1 },
};
