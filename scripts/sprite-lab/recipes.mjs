/**
 * Data-driven 3D model recipes for Risk Force units & buildings.
 * Consumed by the headless three.js sprite renderer.
 */

export const PALETTES = {
  olive: { hull: 0x4a5438, dark: 0x2a3220, accent: 0x6a7850, metal: 0x5a6570, trim: 0xc4a574 },
  desert: { hull: 0x8a7a58, dark: 0x4a4030, accent: 0xa89870, metal: 0x6a7078, trim: 0xd4c090 },
  urban: { hull: 0x5a6068, dark: 0x2a3038, accent: 0x8a929a, metal: 0x707880, trim: 0x7eb6c9 },
  navy: { hull: 0x3a4858, dark: 0x1a2430, accent: 0x5a7088, metal: 0x687080, trim: 0xa8d4e0 },
};

/** @type {Record<string, { kind: string; palette: string; scale?: number; file: string }>} */
export const UNIT_RECIPES = {
  "unit-trooper": { kind: "infantry", palette: "olive", file: "units/unit-trooper.png" },
  "unit-power-trooper": { kind: "infantry", palette: "urban", file: "units/unit-power-trooper.png", elite: true },
  "unit-mech": { kind: "mech", palette: "olive", file: "units/unit-mech.png", scale: 1.15 },
  "unit-walker": { kind: "mech", palette: "desert", file: "units/unit-walker.png", scale: 1.05 },
  "unit-siege-mech": { kind: "mech", palette: "desert", file: "units/unit-siege-mech.png", scale: 1.3, heavy: true },
  "unit-spider": { kind: "spider", palette: "urban", file: "units/unit-spider.png" },
  "unit-hover": { kind: "hover", palette: "olive", file: "units/unit-hover.png" },
  "unit-rail-tank": { kind: "tank", palette: "desert", file: "units/unit-rail-tank.png", rail: true },
  "unit-siege": { kind: "arty", palette: "desert", file: "units/unit-siege.png" },
  "unit-howitzer": { kind: "arty", palette: "olive", file: "units/unit-howitzer.png" },
  "unit-drone": { kind: "drone", palette: "urban", file: "units/unit-drone.png" },
  "unit-ew-drone": { kind: "drone", palette: "navy", file: "units/unit-ew-drone.png", ew: true },
  "unit-gunship": { kind: "aircraft", palette: "olive", file: "units/unit-gunship.png" },
  "unit-bomber": { kind: "aircraft", palette: "urban", file: "units/unit-bomber.png", wide: true },
  "unit-interceptor": { kind: "aircraft", palette: "navy", file: "units/unit-interceptor.png" },
  "unit-dropship": { kind: "aircraft", palette: "desert", file: "units/unit-dropship.png", wide: true },
  "unit-commando": { kind: "infantry", palette: "urban", file: "units/unit-commando.png", stealth: true },
  "unit-stealth": { kind: "infantry", palette: "navy", file: "units/unit-stealth.png", stealth: true },
  "unit-destroyer": { kind: "ship", palette: "navy", file: "units/unit-destroyer.png" },
  "unit-hydrofoil": { kind: "ship", palette: "navy", file: "units/unit-hydrofoil.png", small: true },
  "unit-submarine": { kind: "sub", palette: "navy", file: "units/unit-submarine.png" },
  "unit-orbital": { kind: "orbital", palette: "urban", file: "units/unit-orbital.png" },
};

export const BUILDING_RECIPES = {
  "building-nexus": { kind: "nexus", palette: "urban", file: "buildings/building-nexus.png" },
  "building-reactor": { kind: "reactor", palette: "urban", file: "buildings/building-reactor.png" },
  "building-refinery": { kind: "refinery", palette: "desert", file: "buildings/building-refinery.png" },
  "building-laser": { kind: "turret", palette: "olive", file: "buildings/building-laser.png" },
  "building-missile": { kind: "missile", palette: "olive", file: "buildings/building-missile.png" },
  "building-shield": { kind: "pylon", palette: "navy", file: "buildings/building-shield.png" },
  "building-shield-gen": { kind: "pylon", palette: "navy", file: "buildings/building-shield-gen.png" },
  "building-supply": { kind: "depot", palette: "desert", file: "buildings/building-supply.png" },
  "building-fabricator": { kind: "factory", palette: "urban", file: "buildings/building-fabricator.png" },
  "building-lab": { kind: "lab", palette: "urban", file: "buildings/building-lab.png" },
  "building-flak": { kind: "turret", palette: "desert", file: "buildings/building-flak.png" },
  "building-plasma": { kind: "turret", palette: "navy", file: "buildings/building-plasma.png" },
  "building-railgun": { kind: "turret", palette: "urban", file: "buildings/building-railgun.png", rail: true },
  "building-emp": { kind: "turret", palette: "navy", file: "buildings/building-emp.png" },
  "building-point-defense": { kind: "turret", palette: "olive", file: "buildings/building-point-defense.png" },
  "building-coastal": { kind: "turret", palette: "navy", file: "buildings/building-coastal.png" },
  "building-geothermal": { kind: "plant", palette: "desert", file: "buildings/building-geothermal.png" },
  "building-jammer": { kind: "tower", palette: "urban", file: "buildings/building-jammer.png" },
  "building-sonar": { kind: "tower", palette: "navy", file: "buildings/building-sonar.png" },
  "building-uplink": { kind: "tower", palette: "urban", file: "buildings/building-uplink.png" },
  "building-silo": { kind: "silo", palette: "desert", file: "buildings/building-silo.png" },
  "building-drydock": { kind: "dock", palette: "navy", file: "buildings/building-drydock.png" },
  "building-repair": { kind: "factory", palette: "olive", file: "buildings/building-repair.png" },
  "building-orbital-collector": { kind: "orbital_pad", palette: "urban", file: "buildings/building-orbital-collector.png" },
  "building-dark-matter": { kind: "orbital_pad", palette: "navy", file: "buildings/building-dark-matter.png" },
  "building-cyber": { kind: "lab", palette: "navy", file: "buildings/building-cyber.png" },
  "building-war-college": { kind: "lab", palette: "olive", file: "buildings/building-war-college.png" },
};

export const FX_RECIPES = {
  "fx-explosion": { kind: "explosion", file: "effects/fx-explosion.png" },
  "fx-smoke": { kind: "smoke", file: "effects/fx-smoke.png" },
  "fx-muzzle": { kind: "muzzle", file: "effects/fx-muzzle.png" },
  "fx-wreck": { kind: "wreck", file: "effects/fx-wreck.png" },
  "fx-emp": { kind: "emp", file: "effects/fx-emp.png" },
  "fx-laser": { kind: "beam", file: "effects/fx-laser.png" },
  "fx-plasma": { kind: "bolt", file: "effects/fx-plasma.png" },
};
