/**
 * Procedural three.js military models — PBR meshes for sprite baking.
 * Bundled into an IIFE for headless Chromium rendering.
 */
import * as THREE from "three";
import { PALETTES } from "./recipes.mjs";

/** Procedural roughness / colour noise for weathering. */
function makeNoiseMap(size = 64, strength = 40) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = 180 + Math.floor(Math.random() * strength);
    const dirt = Math.random() > 0.92 ? 40 : 0;
    data[i * 4] = Math.max(0, n - dirt);
    data[i * 4 + 1] = Math.max(0, n - dirt * 0.7);
    data[i * 4 + 2] = Math.max(0, n - dirt * 1.2);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const NOISE = makeNoiseMap();

function mat(color, opts = {}) {
  const { weather = true, ...rest } = opts;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rest.roughness ?? 0.68,
    metalness: rest.metalness ?? 0.32,
    flatShading: false,
    map: weather ? NOISE : null,
    roughnessMap: weather ? NOISE : null,
    ...rest,
  });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 12),
    material,
  );
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.rotation.z = rz;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addFactionStripe(group, palette, y = 0.55, z = 0.42) {
  const stripe = box(0.55, 0.08, 0.04, mat(palette.trim, { metalness: 0.6, roughness: 0.35 }), 0, y, z);
  group.add(stripe);
}

function addAntenna(group, palette, x, y, z) {
  group.add(cyl(0.02, 0.02, 0.45, mat(palette.metal, { metalness: 0.8 }), x, y + 0.22, z));
  group.add(sphere(0.04, mat(0x7eb6c9, { emissive: 0x204050, emissiveIntensity: 0.4 }), x, y + 0.46, z));
}

function groundShadow(group) {
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), shadowMat);
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.01;
  s.scale.set(1.2, 0.7, 1);
  group.add(s);
}

function buildTank(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { roughness: 0.78, metalness: 0.22 });
  const darkM = mat(palette.dark, { roughness: 0.85 });
  const metalM = mat(palette.metal, { metalness: 0.72, roughness: 0.42 });
  const rubberM = mat(0x1a1c18, { roughness: 0.95, metalness: 0.05 });

  // Track skirts
  g.add(box(1.85, 0.34, 0.38, darkM, 0, 0.22, 0.58));
  g.add(box(1.85, 0.34, 0.38, darkM, 0, 0.22, -0.58));
  // Road wheels + return rollers
  for (let i = -3; i <= 3; i++) {
    g.add(cyl(0.14, 0.14, 0.3, rubberM, i * 0.24, 0.16, 0.58, Math.PI / 2));
    g.add(cyl(0.14, 0.14, 0.3, rubberM, i * 0.24, 0.16, -0.58, Math.PI / 2));
    g.add(cyl(0.07, 0.07, 0.32, metalM, i * 0.24, 0.16, 0.58, Math.PI / 2));
    g.add(cyl(0.07, 0.07, 0.32, metalM, i * 0.24, 0.16, -0.58, Math.PI / 2));
  }
  g.add(cyl(0.16, 0.16, 0.32, metalM, -0.82, 0.2, 0.58, Math.PI / 2));
  g.add(cyl(0.16, 0.16, 0.32, metalM, 0.82, 0.2, 0.58, Math.PI / 2));
  g.add(cyl(0.16, 0.16, 0.32, metalM, -0.82, 0.2, -0.58, Math.PI / 2));
  g.add(cyl(0.16, 0.16, 0.32, metalM, 0.82, 0.2, -0.58, Math.PI / 2));
  // Track top plate
  g.add(box(1.9, 0.06, 0.36, rubberM, 0, 0.38, 0.58));
  g.add(box(1.9, 0.06, 0.36, rubberM, 0, 0.38, -0.58));
  // Hull with slope
  g.add(box(1.55, 0.38, 0.95, hullM, 0, 0.48, 0));
  const glacis = box(1.35, 0.14, 0.72, hullM, 0.12, 0.66, 0);
  glacis.rotation.z = -0.22;
  g.add(glacis);
  const sideSkirtL = box(1.4, 0.16, 0.06, hullM, 0, 0.52, 0.52);
  const sideSkirtR = box(1.4, 0.16, 0.06, hullM, 0, 0.52, -0.52);
  g.add(sideSkirtL);
  g.add(sideSkirtR);
  // ERA blocks
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.2, 0.12, 0.16, darkM, 0.4, 0.7, i * 0.17));
    g.add(box(0.16, 0.1, 0.14, darkM, -0.35, 0.68, i * 0.17));
  }
  // Turret
  g.add(cyl(0.4, 0.44, 0.34, hullM, 0.02, 0.86, 0));
  g.add(box(0.58, 0.24, 0.58, hullM, 0.02, 1.02, 0));
  g.add(box(0.2, 0.12, 0.35, darkM, -0.2, 1.12, 0));
  // Mantlet + barrel
  g.add(box(0.32, 0.24, 0.32, metalM, 0.45, 0.96, 0));
  const barrelLen = recipe.rail ? 1.65 : 1.35;
  g.add(cyl(0.055, 0.07, barrelLen, metalM, 0.45 + barrelLen / 2, 0.96, 0, 0, Math.PI / 2));
  g.add(cyl(0.09, 0.09, 0.14, darkM, 0.45 + barrelLen - 0.04, 0.96, 0, 0, Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.45, metalM, 0.55, 1.05, 0.12, 0, Math.PI / 2));
  addAntenna(g, palette, -0.22, 1.05, 0.18);
  addAntenna(g, palette, -0.1, 1.05, -0.2);
  addFactionStripe(g, palette, 0.58, 0.5);
  // Hatch + sensor mast
  g.add(cyl(0.13, 0.13, 0.05, metalM, -0.08, 1.14, 0.12));
  g.add(box(0.08, 0.22, 0.08, metalM, 0.18, 1.22, -0.15));
  g.scale.setScalar(recipe.scale ?? 1);
  return g;
}

function buildHover(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { roughness: 0.6, metalness: 0.38 });
  const darkM = mat(palette.dark, { roughness: 0.8 });
  const metalM = mat(palette.metal, { metalness: 0.78 });
  // Skirt / thruster pods
  for (const [x, z] of [
    [-0.48, 0.38],
    [0.48, 0.38],
    [-0.48, -0.38],
    [0.48, -0.38],
  ]) {
    g.add(cyl(0.28, 0.32, 0.22, darkM, x, 0.2, z));
    g.add(sphere(0.22, darkM, x, 0.12, z, 1.1, 0.55, 1.1));
    const glow = mat(0xff7028, {
      emissive: 0xff4010,
      emissiveIntensity: 0.75,
      roughness: 0.35,
      weather: false,
    });
    g.add(cyl(0.18, 0.18, 0.04, glow, x, 0.04, z));
  }
  // Armoured hull
  g.add(box(1.55, 0.38, 1.0, hullM, 0, 0.42, 0));
  const nose = box(0.55, 0.2, 0.85, hullM, 0.55, 0.5, 0);
  nose.rotation.z = -0.25;
  g.add(nose);
  g.add(box(1.15, 0.18, 0.75, hullM, -0.05, 0.62, 0));
  // Turret + coax
  g.add(cyl(0.34, 0.38, 0.3, hullM, -0.05, 0.82, 0));
  g.add(box(0.4, 0.18, 0.4, hullM, -0.05, 0.98, 0));
  g.add(box(0.26, 0.18, 0.26, metalM, 0.35, 0.88, 0));
  g.add(cyl(0.055, 0.07, 1.25, metalM, 0.95, 0.88, 0, 0, Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.55, metalM, 0.7, 0.95, 0.12, 0, Math.PI / 2));
  addFactionStripe(g, palette, 0.5, 0.52);
  addAntenna(g, palette, -0.28, 0.9, 0.18);
  return g;
}

function buildMech(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { roughness: 0.65 });
  const darkM = mat(palette.dark);
  const metalM = mat(palette.metal, { metalness: 0.7 });
  const s = recipe.heavy ? 1.15 : 1;
  // Feet
  g.add(box(0.35 * s, 0.12, 0.5 * s, darkM, -0.28, 0.1, 0.05));
  g.add(box(0.35 * s, 0.12, 0.5 * s, darkM, 0.28, 0.1, 0.05));
  // Legs
  g.add(box(0.22 * s, 0.55 * s, 0.28 * s, hullM, -0.28, 0.4, 0));
  g.add(box(0.22 * s, 0.55 * s, 0.28 * s, hullM, 0.28, 0.4, 0));
  g.add(cyl(0.1, 0.1, 0.18, metalM, -0.28, 0.7, 0, Math.PI / 2));
  g.add(cyl(0.1, 0.1, 0.18, metalM, 0.28, 0.7, 0, Math.PI / 2));
  g.add(box(0.24 * s, 0.45 * s, 0.3 * s, hullM, -0.28, 0.95, 0));
  g.add(box(0.24 * s, 0.45 * s, 0.3 * s, hullM, 0.28, 0.95, 0));
  // Pelvis + torso
  g.add(box(0.7 * s, 0.25 * s, 0.4 * s, darkM, 0, 1.2, 0));
  g.add(box(0.75 * s, 0.7 * s, 0.45 * s, hullM, 0, 1.65, 0));
  // Cockpit glass
  g.add(box(0.35, 0.22, 0.12, mat(0x2a5060, { metalness: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 }), 0, 1.85, 0.22));
  // Shoulders + weapon arms
  g.add(box(0.3, 0.25, 0.35, hullM, -0.55, 1.85, 0));
  g.add(box(0.3, 0.25, 0.35, hullM, 0.55, 1.85, 0));
  g.add(box(0.55, 0.16, 0.16, metalM, -0.85, 1.7, 0.25));
  g.add(box(0.55, 0.16, 0.16, metalM, 0.85, 1.7, 0.25));
  g.add(cyl(0.08, 0.09, 0.7, metalM, -1.15, 1.7, 0.45, 0, Math.PI / 2));
  g.add(cyl(0.08, 0.09, 0.7, metalM, 1.15, 1.7, 0.45, 0, Math.PI / 2));
  addFactionStripe(g, palette, 1.55, 0.25);
  addAntenna(g, palette, 0.2, 2.0, -0.1);
  g.scale.setScalar((recipe.scale ?? 1) * 0.72);
  return g;
}

function buildOneSoldier(palette, stealth, elite) {
  const g = new THREE.Group();
  const hullM = mat(palette.hull, { roughness: 0.72 });
  const darkM = mat(palette.dark);
  const metalM = mat(palette.metal, { metalness: 0.65 });
  g.add(box(0.16, 0.1, 0.26, darkM, -0.11, 0.07, 0.02));
  g.add(box(0.16, 0.1, 0.26, darkM, 0.11, 0.07, 0.02));
  g.add(box(0.13, 0.42, 0.15, hullM, -0.11, 0.32, 0));
  g.add(box(0.13, 0.42, 0.15, hullM, 0.11, 0.32, 0));
  g.add(cyl(0.035, 0.035, 0.32, metalM, -0.18, 0.38, 0));
  g.add(cyl(0.035, 0.035, 0.32, metalM, 0.18, 0.38, 0));
  g.add(box(0.4, 0.48, 0.26, hullM, 0, 0.72, 0));
  if (elite) g.add(box(0.32, 0.2, 0.12, metalM, 0, 0.78, 0.14));
  else g.add(box(0.26, 0.18, 0.08, metalM, 0, 0.76, 0.14));
  g.add(box(0.11, 0.36, 0.11, hullM, -0.28, 0.7, 0));
  g.add(box(0.11, 0.36, 0.11, hullM, 0.28, 0.7, 0));
  g.add(box(0.07, 0.07, 0.65, metalM, 0.36, 0.62, 0.22));
  g.add(box(0.045, 0.045, 0.1, darkM, 0.36, 0.62, 0.52));
  g.add(box(0.26, 0.2, 0.26, metalM, 0, 1.05, 0));
  g.add(
    box(
      0.2,
      0.08,
      0.06,
      mat(0x1a4050, { metalness: 0.9, roughness: 0.15, weather: false }),
      0,
      1.05,
      0.12,
    ),
  );
  if (!stealth) addFactionStripe(g, palette, 0.68, 0.15);
  addAntenna(g, palette, 0.07, 1.08, -0.06);
  return g;
}

function buildInfantry(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  // Squad formation — 3–4 exosuit troopers
  const offsets = recipe.elite
    ? [
        [0, 0],
        [-0.55, 0.35],
        [0.55, 0.3],
      ]
    : [
        [-0.45, 0.35],
        [0.15, 0],
        [0.55, 0.4],
        [-0.15, 0.55],
      ];
  for (const [x, z] of offsets) {
    const s = buildOneSoldier(palette, recipe.stealth, recipe.elite);
    s.position.set(x, 0, z);
    s.rotation.y = -0.35 + x * 0.15;
    g.add(s);
  }
  g.scale.setScalar(0.85);
  return g;
}

function buildDrone(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { metalness: 0.55, roughness: 0.45 });
  const metalM = mat(palette.metal, { metalness: 0.8 });
  g.add(box(0.7, 0.2, 0.45, hullM, 0, 0.55, 0));
  g.add(sphere(0.18, mat(0x2a5060, { metalness: 0.9, roughness: 0.2 }), 0, 0.55, 0.15, 1, 0.8, 0.7));
  // Arms
  g.add(box(0.9, 0.06, 0.08, metalM, 0, 0.7, 0));
  g.add(cyl(0.12, 0.12, 0.04, metalM, -0.4, 0.72, 0));
  g.add(cyl(0.12, 0.12, 0.04, metalM, 0.4, 0.72, 0));
  // Rotor discs (blur)
  const blur = mat(0x8899aa, { transparent: true, opacity: 0.25, roughness: 0.3 });
  g.add(cyl(0.35, 0.35, 0.02, blur, -0.4, 0.78, 0));
  g.add(cyl(0.35, 0.35, 0.02, blur, 0.4, 0.78, 0));
  if (recipe.ew) {
    g.add(cyl(0.02, 0.02, 0.5, metalM, 0, 0.9, -0.1));
  }
  g.add(box(0.15, 0.1, 0.2, mat(palette.dark), 0, 0.4, 0.1));
  return g;
}

function buildAircraft(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { metalness: 0.5, roughness: 0.4 });
  const metalM = mat(palette.metal, { metalness: 0.75 });
  const len = recipe.wide ? 1.8 : 1.4;
  g.add(box(len, 0.25, 0.35, hullM, 0, 0.5, 0));
  g.add(box(0.5, 0.2, 1.4, hullM, -0.1, 0.5, 0));
  g.add(box(0.35, 0.18, 0.25, metalM, len * 0.35, 0.62, 0));
  g.add(cyl(0.05, 0.06, 0.6, metalM, len * 0.2, 0.42, 0.2, 0, Math.PI / 2));
  addFactionStripe(g, palette, 0.55, 0.2);
  return g;
}

function buildArty(recipe, palette) {
  const g = buildTank({ ...recipe, rail: false }, palette);
  // Replace barrel with longer howitzer
  g.children.filter((c) => c.geometry?.type === "CylinderGeometry" && c.scale).forEach(() => {});
  g.add(cyl(0.08, 0.1, 1.6, mat(palette.metal, { metalness: 0.8 }), 0.9, 1.05, 0, 0, Math.PI / 2));
  g.add(box(0.4, 0.35, 0.4, mat(palette.dark), 0.1, 1.05, 0));
  return g;
}

function buildSpider(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.7 });
  g.add(sphere(0.4, hullM, 0, 0.55, 0, 1.1, 0.7, 1));
  g.add(sphere(0.15, mat(0x1a4050, { metalness: 0.9 }), 0, 0.6, 0.35));
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1], [-1.2, 0], [1.2, 0]];
  for (const [lx, lz] of legs) {
    const leg = box(0.08, 0.08, 0.7, metalM, lx * 0.35, 0.4, lz * 0.25);
    leg.lookAt(lx, 0.1, lz);
    g.add(leg);
    g.add(box(0.12, 0.08, 0.2, mat(palette.dark), lx * 0.65, 0.12, lz * 0.45));
  }
  return g;
}

function buildShip(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { metalness: 0.45 });
  const s = recipe.small ? 0.75 : 1;
  g.add(box(1.8 * s, 0.3 * s, 0.45 * s, hullM, 0, 0.3, 0));
  g.add(box(0.5 * s, 0.35 * s, 0.35 * s, hullM, -0.2, 0.55, 0));
  g.add(cyl(0.04, 0.05, 0.8 * s, mat(palette.metal, { metalness: 0.8 }), 0.5, 0.5, 0, 0, Math.PI / 2));
  return g;
}

function buildSub(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(sphere(0.35, mat(palette.hull, { metalness: 0.5 }), 0, 0.35, 0, 2.2, 0.7, 0.7));
  g.add(box(0.25, 0.3, 0.2, mat(palette.dark), -0.1, 0.6, 0));
  g.add(cyl(0.03, 0.03, 0.4, mat(palette.metal), -0.1, 0.85, 0));
  return g;
}

function buildOrbital(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(sphere(0.4, mat(palette.hull, { metalness: 0.6, roughness: 0.35 }), 0, 0.7, 0));
  g.add(cyl(0.5, 0.5, 0.08, mat(palette.metal, { metalness: 0.8 }), 0, 0.7, 0));
  g.add(cyl(0.06, 0.15, 0.5, mat(0xff6020, { emissive: 0xff4010, emissiveIntensity: 0.5 }), 0, 0.25, 0));
  return g;
}

function buildTurret(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.75 });
  g.add(box(0.9, 0.15, 0.9, mat(palette.dark), 0, 0.1, 0));
  g.add(cyl(0.28, 0.35, 0.55, hullM, 0, 0.45, 0));
  g.add(box(0.35, 0.25, 0.35, hullM, 0, 0.85, 0));
  const len = recipe.rail ? 1.1 : 0.75;
  g.add(cyl(0.06, 0.07, len, metalM, 0, 0.9, len / 2 - 0.05, Math.PI / 2));
  g.add(sphere(0.1, mat(0x7eb6c9, { emissive: 0x306070, emissiveIntensity: 0.5 }), 0, 1.05, 0));
  return g;
}

function buildNexus(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(1.6, 0.15, 1.6, mat(palette.dark), 0, 0.08, 0));
  g.add(cyl(0.7, 0.9, 0.9, mat(palette.hull, { metalness: 0.4 }), 0, 0.6, 0, 0, 0));
  g.add(box(0.6, 0.7, 0.6, mat(palette.metal, { metalness: 0.6 }), 0, 1.2, 0));
  g.add(sphere(0.25, mat(0x4a90a8, { emissive: 0x206080, emissiveIntensity: 0.6 }), 0, 1.55, 0));
  addAntenna(g, palette, 0.35, 1.4, 0.35);
  return g;
}

function buildReactor(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(cyl(0.55, 0.6, 0.7, mat(palette.hull), 0, 0.45, 0));
  g.add(sphere(0.35, mat(0x7eb6c9, { emissive: 0x3080a0, emissiveIntensity: 0.55, roughness: 0.3 }), 0, 0.55, 0));
  g.add(box(0.2, 0.4, 0.2, mat(palette.dark), -0.4, 0.25, 0.4));
  g.add(box(0.2, 0.4, 0.2, mat(palette.dark), 0.4, 0.25, 0.4));
  return g;
}

function buildRefinery(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(1.2, 0.6, 0.8, mat(palette.hull), 0, 0.4, 0));
  g.add(cyl(0.12, 0.12, 1.0, mat(palette.metal), -0.3, 0.9, 0.1));
  g.add(cyl(0.12, 0.12, 1.2, mat(palette.metal), 0, 1.0, 0.1));
  g.add(cyl(0.12, 0.12, 0.9, mat(palette.metal), 0.3, 0.85, 0.1));
  return g;
}

function buildMissile(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(1.0, 0.5, 0.8, mat(palette.hull), 0, 0.35, 0));
  for (let i = -1; i <= 1; i++) {
    g.add(cyl(0.1, 0.1, 0.9, mat(palette.metal, { metalness: 0.7 }), i * 0.25, 0.9, 0));
    g.add(cyl(0.02, 0.1, 0.15, mat(palette.dark), i * 0.25, 1.4, 0));
  }
  return g;
}

function buildPylon(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { metalness: 0.4 });
  const darkM = mat(palette.dark);
  g.add(box(1.0, 0.14, 1.0, darkM, 0, 0.08, 0));
  g.add(box(0.7, 0.35, 0.7, hullM, 0, 0.32, 0));
  // Emitter mast with braced frame
  g.add(box(0.22, 0.85, 0.22, hullM, 0, 0.85, 0));
  g.add(box(0.08, 0.7, 0.08, mat(palette.metal, { metalness: 0.7 }), -0.22, 0.75, -0.22));
  g.add(box(0.08, 0.7, 0.08, mat(palette.metal, { metalness: 0.7 }), 0.22, 0.75, 0.22));
  // Shield emitter dome (not a toy blob — framed projector)
  const dome = sphere(
    0.32,
    mat(0x6aa0b4, {
      emissive: 0x305870,
      emissiveIntensity: 0.45,
      metalness: 0.55,
      roughness: 0.25,
      transparent: true,
      opacity: 0.85,
      weather: false,
    }),
    0,
    1.35,
    0,
    1,
    0.7,
    1,
  );
  g.add(dome);
  g.add(cyl(0.35, 0.35, 0.06, mat(palette.metal, { metalness: 0.75 }), 0, 1.18, 0));
  addAntenna(g, palette, 0.2, 1.4, -0.15);
  return g;
}

function buildDepot(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(1.2, 0.55, 0.9, mat(palette.hull), 0, 0.35, 0));
  g.add(box(0.35, 0.25, 0.05, mat(palette.dark), -0.3, 0.4, 0.46));
  g.add(box(0.35, 0.25, 0.05, mat(palette.dark), 0.3, 0.4, 0.46));
  return g;
}

function buildFactory(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(1.4, 0.7, 1.0, mat(palette.hull), 0, 0.45, 0));
  g.add(box(0.25, 0.7, 0.25, mat(palette.metal), -0.4, 1.0, -0.2));
  g.add(box(0.25, 0.9, 0.25, mat(palette.metal), 0.1, 1.1, -0.2));
  g.add(box(0.25, 0.6, 0.25, mat(palette.metal), 0.5, 0.95, -0.2));
  return g;
}

function buildLab(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(1.2, 0.65, 0.9, mat(palette.hull), 0, 0.4, 0));
  g.add(box(0.7, 0.35, 0.1, mat(0x2a5060, { metalness: 0.85, roughness: 0.2 }), 0, 0.85, 0.4));
  return g;
}

function buildTower(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(cyl(0.2, 0.28, 1.2, mat(palette.hull), 0, 0.7, 0));
  g.add(sphere(0.18, mat(0x7eb6c9, { emissive: 0x305060, emissiveIntensity: 0.45 }), 0, 1.4, 0));
  return g;
}

function buildSilo(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(cyl(0.4, 0.45, 1.3, mat(palette.hull), 0, 0.75, 0));
  g.add(cyl(0.42, 0.1, 0.2, mat(palette.dark), 0, 1.45, 0));
  return g;
}

function buildDock(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(1.6, 0.2, 1.0, mat(palette.dark), 0, 0.15, 0));
  g.add(box(0.3, 0.5, 0.3, mat(palette.hull), -0.5, 0.45, -0.3));
  g.add(box(0.3, 0.5, 0.3, mat(palette.hull), 0.5, 0.45, -0.3));
  return g;
}

function buildPlant(recipe, palette) {
  return buildReactor(recipe, palette);
}

function buildOrbitalPad(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(cyl(0.7, 0.7, 0.12, mat(palette.dark), 0, 0.1, 0));
  g.add(sphere(0.35, mat(palette.hull, { metalness: 0.55 }), 0, 0.5, 0));
  return g;
}

function buildExplosion() {
  const g = new THREE.Group();
  const core = mat(0xfff0c0, { emissive: 0xffaa40, emissiveIntensity: 1.2, transparent: true, opacity: 0.95 });
  const mid = mat(0xff6020, { emissive: 0xff4010, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
  const smoke = mat(0x3a3834, { transparent: true, opacity: 0.45, roughness: 1 });
  g.add(sphere(0.35, core, 0, 0.8, 0));
  g.add(sphere(0.7, mid, 0, 0.7, 0));
  g.add(sphere(0.5, smoke, -0.3, 1.2, 0.2, 1.4, 1.2, 1.3));
  g.add(sphere(0.45, smoke, 0.35, 1.4, -0.15, 1.3, 1.5, 1.2));
  g.add(sphere(0.4, smoke, 0.1, 1.7, 0.1, 1.2, 1.4, 1.2));
  // Debris
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(box(0.08, 0.08, 0.08, mat(0x2a2420), Math.cos(a) * 0.6, 0.5 + (i % 3) * 0.15, Math.sin(a) * 0.6));
  }
  return g;
}

function buildSmoke() {
  const g = new THREE.Group();
  const smoke = mat(0x4a4844, { transparent: true, opacity: 0.4, roughness: 1 });
  g.add(sphere(0.4, smoke, 0, 0.4, 0, 1.3, 0.8, 1.2));
  g.add(sphere(0.45, smoke, 0.15, 0.9, 0.1, 1.2, 1.3, 1.1));
  g.add(sphere(0.35, smoke, -0.1, 1.4, -0.05, 1.1, 1.4, 1.2));
  return g;
}

function buildMuzzle() {
  const g = new THREE.Group();
  g.add(sphere(0.2, mat(0xfff8e0, { emissive: 0xffc060, emissiveIntensity: 1.5 }), -0.3, 0.5, 0));
  g.add(cyl(0.08, 0.25, 0.7, mat(0xff9020, { emissive: 0xff6010, emissiveIntensity: 0.9, transparent: true, opacity: 0.7 }), 0.1, 0.5, 0, 0, Math.PI / 2));
  return g;
}

function buildWreck() {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(box(0.9, 0.25, 0.5, mat(0x2a2420, { roughness: 0.95 }), 0.1, 0.25, 0));
  g.add(box(0.4, 0.2, 0.3, mat(0x3a342e), -0.3, 0.35, 0.15));
  g.add(box(0.2, 0.15, 0.4, mat(0x1a1814), 0.4, 0.2, -0.2));
  return g;
}

function buildEmp() {
  const g = new THREE.Group();
  const ring = mat(0x7eb6c9, { emissive: 0x406080, emissiveIntensity: 0.6, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 32), ring);
  r1.rotation.x = -Math.PI / 2;
  r1.position.y = 0.5;
  g.add(r1);
  const r2 = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 32), ring);
  r2.rotation.x = -Math.PI / 2;
  r2.position.y = 0.5;
  g.add(r2);
  g.add(sphere(0.15, mat(0xc8e8f0, { emissive: 0xa0d0e0, emissiveIntensity: 0.8 }), 0, 0.5, 0));
  return g;
}

function buildBeam() {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.04, 2.0, mat(0x9fd4e4, { emissive: 0x7eb6c9, emissiveIntensity: 0.9 }), 0, 0.5, 0, 0, Math.PI / 2));
  return g;
}

function buildBolt() {
  const g = new THREE.Group();
  g.add(sphere(0.2, mat(0x6ec4a0, { emissive: 0x40a080, emissiveIntensity: 0.8 }), 0, 0.5, 0));
  return g;
}

const BUILDERS = {
  tank: buildTank,
  hover: buildHover,
  mech: buildMech,
  infantry: buildInfantry,
  drone: buildDrone,
  aircraft: buildAircraft,
  arty: buildArty,
  spider: buildSpider,
  ship: buildShip,
  sub: buildSub,
  orbital: buildOrbital,
  turret: buildTurret,
  nexus: buildNexus,
  reactor: buildReactor,
  refinery: buildRefinery,
  missile: buildMissile,
  pylon: buildPylon,
  depot: buildDepot,
  factory: buildFactory,
  lab: buildLab,
  tower: buildTower,
  silo: buildSilo,
  dock: buildDock,
  plant: buildPlant,
  orbital_pad: buildOrbitalPad,
  explosion: buildExplosion,
  smoke: buildSmoke,
  muzzle: buildMuzzle,
  wreck: buildWreck,
  emp: buildEmp,
  beam: buildBeam,
  bolt: buildBolt,
};

export function buildModel(recipe) {
  const palette = PALETTES[recipe.palette] || PALETTES.olive;
  const builder = BUILDERS[recipe.kind];
  if (!builder) {
    const g = new THREE.Group();
    g.add(box(0.8, 0.8, 0.8, mat(0x888888), 0, 0.4, 0));
    return g;
  }
  return builder(recipe, palette);
}

export function createRenderer(width, height) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

export function createStudioScene() {
  const scene = new THREE.Scene();
  scene.background = null;

  const ambient = new THREE.AmbientLight(0xc8d4e0, 0.45);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xd0e0f0, 0x3a4030, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff5e8, 1.35);
  key.position.set(4, 7, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xa0c0e0, 0.45);
  fill.position.set(-3, 3, -2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffe0c0, 0.35);
  rim.position.set(-2, 2, 4);
  scene.add(rim);

  // Ground plane for contact shadows
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3, 32),
    new THREE.ShadowMaterial({ opacity: 0.35 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  return scene;
}

export function createIsoCamera(width, height) {
  const cam = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);
  // Fixed 3/4 isometric angle — models fill frame
  cam.position.set(2.85, 2.45, 2.85);
  cam.lookAt(0, 0.65, 0);
  return cam;
}

export function renderRecipe(renderer, scene, camera, recipe, frame = "idle") {
  // Clear previous model
  const toRemove = [];
  scene.traverse((o) => {
    if (o.userData?.isUnit) toRemove.push(o);
  });
  toRemove.forEach((o) => scene.remove(o));

  const model = buildModel(recipe);
  model.userData.isUnit = true;

  if (frame === "fire" && (recipe.kind === "tank" || recipe.kind === "hover" || recipe.kind === "mech" || recipe.kind === "turret")) {
    model.rotation.y = 0.15;
  }
  if (frame === "move") {
    model.position.y = 0.04;
    model.rotation.y = -0.08;
  }
  if (frame === "death") {
    model.rotation.z = 0.5;
    model.position.y = 0.1;
  }

  scene.add(model);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}
