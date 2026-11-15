/**
 * Procedural three.js military models — PBR meshes for sprite baking.
 * Brighter studio lighting, RoundedBox bevels, env reflections, 2× bake.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PALETTES } from "./recipes.mjs";

function makeNoiseMap(size = 128, strength = 55) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = 160 + Math.floor(Math.random() * strength);
    const dirt = Math.random() > 0.88 ? 55 : Math.random() > 0.7 ? 18 : 0;
    data[i * 4] = Math.max(40, n - dirt);
    data[i * 4 + 1] = Math.max(40, n - dirt * 0.65);
    data[i * 4 + 2] = Math.max(35, n - dirt * 1.1);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeNormalNoise(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 128 + ((Math.random() * 40) | 0) - 20;
    data[i * 4 + 1] = 128 + ((Math.random() * 40) | 0) - 20;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const NOISE = makeNoiseMap();
const NORMAL = makeNormalNoise();

function mat(color, opts = {}) {
  const { weather = true, ...rest } = opts;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rest.roughness ?? 0.55,
    metalness: rest.metalness ?? 0.38,
    flatShading: false,
    map: weather ? NOISE : null,
    roughnessMap: weather ? NOISE : null,
    normalMap: weather ? NORMAL : null,
    normalScale: weather ? new THREE.Vector2(0.35, 0.35) : undefined,
    ...rest,
  });
}

function rbox(w, h, d, material, x = 0, y = 0, z = 0, radius = 0.04, seg = 3) {
  const m = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, seg, Math.min(radius, Math.min(w, h, d) * 0.2)),
    material,
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  return rbox(w, h, d, material, x, y, z, 0.02, 2);
}

function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, rx = 0, rz = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.rotation.z = rz;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(10, (seg / 1.5) | 0)), material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addFactionStripe(group, palette, y = 0.55, z = 0.42) {
  group.add(rbox(0.55, 0.07, 0.05, mat(palette.trim, { metalness: 0.55, roughness: 0.4 }), 0, y, z, 0.02));
  // Hull number decal
  group.add(rbox(0.22, 0.12, 0.03, mat(0xf0f4f8, { metalness: 0.1, roughness: 0.5, weather: false }), 0.35, y + 0.02, z, 0.01));
}

function addAntenna(group, palette, x, y, z) {
  group.add(cyl(0.015, 0.015, 0.5, mat(palette.metal, { metalness: 0.85, roughness: 0.3 }), x, y + 0.25, z));
  group.add(sphere(0.035, mat(0x9fd4e4, { emissive: 0x406878, emissiveIntensity: 0.55, weather: false }), x, y + 0.52, z));
}

function groundShadow(group, sx = 1.15, sz = 0.75) {
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28), shadowMat);
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.008;
  s.scale.set(sx, sz, 1);
  group.add(s);
}

function buildTank(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.35, 0.8);
  const hullM = mat(palette.hull, { roughness: 0.62, metalness: 0.28 });
  const darkM = mat(palette.dark, { roughness: 0.75 });
  const metalM = mat(palette.metal, { metalness: 0.78, roughness: 0.35 });
  const rubberM = mat(0x22241e, { roughness: 0.92, metalness: 0.08 });

  // Track skirts / mudguards
  g.add(rbox(1.95, 0.22, 0.42, darkM, 0, 0.28, 0.58, 0.04));
  g.add(rbox(1.95, 0.22, 0.42, darkM, 0, 0.28, -0.58, 0.04));
  g.add(rbox(1.9, 0.08, 0.4, rubberM, 0, 0.42, 0.58, 0.02));
  g.add(rbox(1.9, 0.08, 0.4, rubberM, 0, 0.42, -0.58, 0.02));

  // 7 road wheels per side + sprockets
  for (let i = -3; i <= 3; i++) {
    const wx = i * 0.26;
    for (const z of [0.58, -0.58]) {
      g.add(cyl(0.15, 0.15, 0.18, rubberM, wx, 0.16, z, Math.PI / 2));
      g.add(cyl(0.08, 0.08, 0.2, metalM, wx, 0.16, z, Math.PI / 2));
    }
  }
  for (const z of [0.58, -0.58]) {
    g.add(cyl(0.17, 0.17, 0.2, metalM, -0.95, 0.2, z, Math.PI / 2));
    g.add(cyl(0.17, 0.17, 0.2, metalM, 0.95, 0.2, z, Math.PI / 2));
  }
  // Track link suggestion
  for (let i = -4; i <= 4; i++) {
    g.add(rbox(0.12, 0.05, 0.38, rubberM, i * 0.22, 0.05, 0.58, 0.01));
    g.add(rbox(0.12, 0.05, 0.38, rubberM, i * 0.22, 0.05, -0.58, 0.01));
  }

  // Hull + glacis
  g.add(rbox(1.6, 0.4, 1.0, hullM, 0, 0.52, 0, 0.05));
  const glacis = rbox(1.35, 0.16, 0.75, hullM, 0.18, 0.72, 0, 0.04);
  glacis.rotation.z = -0.28;
  g.add(glacis);
  // Side stowage / smoke launchers
  for (let i = -1; i <= 1; i++) {
    g.add(rbox(0.18, 0.14, 0.16, darkM, 0.15, 0.72, i * 0.28, 0.03));
    g.add(cyl(0.04, 0.04, 0.12, metalM, 0.55, 0.78, i * 0.22, 0, Math.PI / 2));
  }
  // ERA
  for (let i = -2; i <= 2; i++) {
    g.add(rbox(0.2, 0.1, 0.15, darkM, 0.42, 0.78, i * 0.17, 0.02));
  }

  // Cast-ish turret
  g.add(cyl(0.42, 0.46, 0.36, hullM, 0, 0.92, 0, 0, 0, 20));
  g.add(rbox(0.62, 0.26, 0.62, hullM, 0, 1.1, 0, 0.06));
  g.add(rbox(0.28, 0.14, 0.4, darkM, -0.18, 1.22, 0, 0.03));
  // Mantlet + long barrel + muzzle brake
  g.add(rbox(0.36, 0.26, 0.36, metalM, 0.48, 1.02, 0, 0.04));
  const barrelLen = recipe.rail ? 1.75 : 1.45;
  g.add(cyl(0.05, 0.065, barrelLen, metalM, 0.48 + barrelLen / 2, 1.02, 0, 0, Math.PI / 2, 14));
  g.add(cyl(0.085, 0.07, 0.16, darkM, 0.48 + barrelLen - 0.02, 1.02, 0, 0, Math.PI / 2));
  g.add(cyl(0.025, 0.025, 0.5, metalM, 0.7, 1.1, 0.14, 0, Math.PI / 2));
  addAntenna(g, palette, -0.22, 1.12, 0.2);
  addAntenna(g, palette, -0.08, 1.12, -0.22);
  addFactionStripe(g, palette, 0.58, 0.52);
  g.add(cyl(0.14, 0.14, 0.05, metalM, -0.1, 1.24, 0.12));
  g.add(rbox(0.1, 0.28, 0.1, metalM, 0.2, 1.32, -0.18, 0.02));
  g.scale.setScalar(recipe.scale ?? 1);
  return g;
}

function buildHover(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.25, 0.85);
  const hullM = mat(palette.hull, { roughness: 0.5, metalness: 0.42 });
  const darkM = mat(palette.dark, { roughness: 0.7 });
  const metalM = mat(palette.metal, { metalness: 0.8, roughness: 0.32 });
  for (const [x, z] of [[-0.5, 0.4], [0.5, 0.4], [-0.5, -0.4], [0.5, -0.4]]) {
    g.add(cyl(0.3, 0.34, 0.24, darkM, x, 0.22, z));
    g.add(sphere(0.24, darkM, x, 0.12, z, 1.15, 0.5, 1.15));
    const glow = mat(0xff8030, { emissive: 0xff5010, emissiveIntensity: 0.85, roughness: 0.3, weather: false });
    g.add(cyl(0.2, 0.2, 0.04, glow, x, 0.04, z));
  }
  g.add(rbox(1.6, 0.4, 1.05, hullM, 0, 0.48, 0, 0.06));
  const nose = rbox(0.6, 0.22, 0.9, hullM, 0.58, 0.55, 0, 0.05);
  nose.rotation.z = -0.28;
  g.add(nose);
  g.add(rbox(1.2, 0.2, 0.8, hullM, -0.05, 0.7, 0, 0.04));
  g.add(cyl(0.36, 0.4, 0.32, hullM, -0.05, 0.92, 0));
  g.add(rbox(0.42, 0.2, 0.42, hullM, -0.05, 1.1, 0, 0.05));
  g.add(rbox(0.28, 0.2, 0.28, metalM, 0.38, 0.98, 0, 0.03));
  g.add(cyl(0.05, 0.065, 1.3, metalM, 1.0, 0.98, 0, 0, Math.PI / 2));
  addFactionStripe(g, palette, 0.55, 0.54);
  addAntenna(g, palette, -0.3, 1.0, 0.2);
  return g;
}

function buildMech(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.0, 0.7);
  const hullM = mat(palette.hull, { roughness: 0.58 });
  const darkM = mat(palette.dark);
  const metalM = mat(palette.metal, { metalness: 0.75, roughness: 0.35 });
  const s = recipe.heavy ? 1.12 : 1;

  // Articulated legs: foot / shin / knee / thigh
  for (const side of [-1, 1]) {
    const x = side * 0.32 * s;
    g.add(rbox(0.38 * s, 0.12, 0.55 * s, darkM, x, 0.1, 0.06, 0.04)); // foot
    g.add(rbox(0.22 * s, 0.5 * s, 0.26 * s, hullM, x, 0.42, 0, 0.04)); // shin
    g.add(cyl(0.1 * s, 0.1 * s, 0.2 * s, metalM, x, 0.72, 0, Math.PI / 2)); // knee
    g.add(rbox(0.24 * s, 0.48 * s, 0.28 * s, hullM, x, 1.0, -0.04, 0.04)); // thigh
  }
  // Pelvis + torso armour
  g.add(rbox(0.75 * s, 0.28 * s, 0.42 * s, darkM, 0, 1.28, 0, 0.05));
  g.add(rbox(0.82 * s, 0.75 * s, 0.5 * s, hullM, 0, 1.75, 0, 0.06));
  // Chest plate + cockpit
  g.add(rbox(0.55, 0.4, 0.12, metalM, 0, 1.8, 0.28, 0.04));
  g.add(rbox(0.38, 0.22, 0.1, mat(0x1a5060, { metalness: 0.9, roughness: 0.15, transparent: true, opacity: 0.9, weather: false }), 0, 1.95, 0.3, 0.02));
  // Shoulder pads
  g.add(rbox(0.38, 0.28, 0.4, hullM, -0.58, 2.0, 0, 0.05));
  g.add(rbox(0.38, 0.28, 0.4, hullM, 0.58, 2.0, 0, 0.05));
  // Weapon arms
  g.add(rbox(0.6, 0.18, 0.18, metalM, -0.95, 1.85, 0.2, 0.03));
  g.add(rbox(0.6, 0.18, 0.18, metalM, 0.95, 1.85, 0.2, 0.03));
  g.add(cyl(0.07, 0.09, 0.75, metalM, -1.25, 1.85, 0.45, 0, Math.PI / 2));
  g.add(cyl(0.07, 0.09, 0.75, metalM, 1.25, 1.85, 0.45, 0, Math.PI / 2));
  addFactionStripe(g, palette, 1.65, 0.28);
  addAntenna(g, palette, 0.22, 2.15, -0.1);
  g.scale.setScalar((recipe.scale ?? 1) * 0.68);
  return g;
}

function buildOneSoldier(palette, stealth, elite) {
  const g = new THREE.Group();
  const hullM = mat(palette.hull, { roughness: 0.6 });
  const darkM = mat(palette.dark);
  const metalM = mat(palette.metal, { metalness: 0.7, roughness: 0.35 });
  // Boots / legs — humanoid proportions
  g.add(rbox(0.14, 0.1, 0.24, darkM, -0.1, 0.08, 0.02, 0.02));
  g.add(rbox(0.14, 0.1, 0.24, darkM, 0.1, 0.08, 0.02, 0.02));
  g.add(rbox(0.12, 0.4, 0.14, hullM, -0.1, 0.32, 0, 0.025));
  g.add(rbox(0.12, 0.4, 0.14, hullM, 0.1, 0.32, 0, 0.025));
  // Torso + backpack
  g.add(rbox(0.38, 0.48, 0.26, hullM, 0, 0.72, 0, 0.04));
  g.add(rbox(0.28, 0.32, 0.14, darkM, 0, 0.75, -0.18, 0.03));
  if (elite) g.add(rbox(0.3, 0.2, 0.1, metalM, 0, 0.78, 0.15, 0.02));
  // Arms
  g.add(rbox(0.1, 0.36, 0.1, hullM, -0.28, 0.7, 0.02, 0.02));
  g.add(rbox(0.1, 0.36, 0.1, hullM, 0.28, 0.68, 0.08, 0.02));
  // Rifle held across body
  const rifle = rbox(0.06, 0.06, 0.7, metalM, 0.22, 0.62, 0.28, 0.015);
  rifle.rotation.x = -0.15;
  rifle.rotation.y = -0.35;
  g.add(rifle);
  g.add(rbox(0.05, 0.05, 0.1, darkM, 0.32, 0.58, 0.55, 0.01));
  // Helmet + visor
  g.add(rbox(0.26, 0.22, 0.28, metalM, 0, 1.08, 0, 0.05));
  g.add(rbox(0.22, 0.08, 0.06, mat(0x1a5068, { metalness: 0.95, roughness: 0.12, weather: false }), 0, 1.08, 0.14, 0.01));
  if (!stealth) addFactionStripe(g, palette, 0.68, 0.15);
  addAntenna(g, palette, 0.08, 1.12, -0.08);
  return g;
}

function buildInfantry(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.1, 0.8);
  const offsets = recipe.elite
    ? [[0, 0], [-0.55, 0.32], [0.55, 0.28]]
    : [[-0.48, 0.32], [0.12, 0], [0.55, 0.38], [-0.12, 0.55]];
  for (const [x, z] of offsets) {
    const s = buildOneSoldier(palette, recipe.stealth, recipe.elite);
    s.position.set(x, 0, z);
    s.rotation.y = -0.4 + x * 0.12;
    g.add(s);
  }
  g.scale.setScalar(0.88);
  return g;
}

function buildDrone(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 0.9, 0.7);
  const hullM = mat(palette.hull, { metalness: 0.55, roughness: 0.4 });
  const metalM = mat(palette.metal, { metalness: 0.82, roughness: 0.28 });
  g.add(rbox(0.75, 0.22, 0.48, hullM, 0, 0.58, 0, 0.05));
  g.add(sphere(0.16, mat(0x2a6080, { metalness: 0.9, roughness: 0.15, weather: false }), 0, 0.58, 0.18, 1, 0.8, 0.7));
  g.add(rbox(0.95, 0.06, 0.08, metalM, 0, 0.72, 0, 0.02));
  g.add(cyl(0.14, 0.14, 0.05, metalM, -0.42, 0.74, 0));
  g.add(cyl(0.14, 0.14, 0.05, metalM, 0.42, 0.74, 0));
  const blur = mat(0xa8b8c8, { transparent: true, opacity: 0.28, roughness: 0.25, weather: false });
  g.add(cyl(0.38, 0.38, 0.02, blur, -0.42, 0.8, 0));
  g.add(cyl(0.38, 0.38, 0.02, blur, 0.42, 0.8, 0));
  if (recipe.ew) g.add(cyl(0.015, 0.015, 0.55, metalM, 0, 0.95, -0.1));
  return g;
}

function buildAircraft(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.2, 0.6);
  const hullM = mat(palette.hull, { metalness: 0.55, roughness: 0.38 });
  const metalM = mat(palette.metal, { metalness: 0.8, roughness: 0.3 });
  const len = recipe.wide ? 1.9 : 1.45;
  g.add(rbox(len, 0.28, 0.38, hullM, 0, 0.55, 0, 0.05));
  g.add(rbox(0.55, 0.12, 1.5, hullM, -0.1, 0.55, 0, 0.03));
  g.add(rbox(0.35, 0.35, 0.12, hullM, -len * 0.35, 0.72, 0, 0.03));
  g.add(cyl(0.05, 0.06, 0.65, metalM, len * 0.2, 0.45, 0.22, 0, Math.PI / 2));
  addFactionStripe(g, palette, 0.6, 0.22);
  return g;
}

function buildArty(recipe, palette) {
  const g = buildTank({ ...recipe, rail: false }, palette);
  g.add(cyl(0.08, 0.1, 1.7, mat(palette.metal, { metalness: 0.82 }), 0.95, 1.15, 0, 0, Math.PI / 2));
  g.add(rbox(0.42, 0.38, 0.42, mat(palette.dark), 0.1, 1.15, 0, 0.04));
  return g;
}

function buildSpider(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.75 });
  g.add(sphere(0.42, hullM, 0, 0.58, 0, 1.15, 0.72, 1));
  g.add(sphere(0.14, mat(0x1a5068, { metalness: 0.9, weather: false }), 0, 0.62, 0.38));
  for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1], [-1.25, 0], [1.25, 0]]) {
    const leg = rbox(0.07, 0.07, 0.75, metalM, lx * 0.35, 0.42, lz * 0.25, 0.02);
    leg.lookAt(lx, 0.08, lz);
    g.add(leg);
    g.add(rbox(0.14, 0.08, 0.22, mat(palette.dark), lx * 0.68, 0.1, lz * 0.48, 0.02));
  }
  return g;
}

function buildShip(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.4, 0.55);
  const hullM = mat(palette.hull, { metalness: 0.48 });
  const s = recipe.small ? 0.75 : 1;
  g.add(rbox(1.9 * s, 0.32 * s, 0.48 * s, hullM, 0, 0.32, 0, 0.05));
  g.add(rbox(0.55 * s, 0.38 * s, 0.38 * s, hullM, -0.2, 0.58, 0, 0.04));
  g.add(cyl(0.04, 0.05, 0.85 * s, mat(palette.metal, { metalness: 0.82 }), 0.55, 0.52, 0, 0, Math.PI / 2));
  return g;
}

function buildSub(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.2, 0.5);
  g.add(sphere(0.38, mat(palette.hull, { metalness: 0.55 }), 0, 0.38, 0, 2.3, 0.72, 0.72));
  g.add(rbox(0.28, 0.32, 0.22, mat(palette.dark), -0.1, 0.62, 0, 0.03));
  g.add(cyl(0.025, 0.025, 0.42, mat(palette.metal), -0.1, 0.88, 0));
  return g;
}

function buildOrbital(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(sphere(0.42, mat(palette.hull, { metalness: 0.65, roughness: 0.32 }), 0, 0.75, 0));
  g.add(cyl(0.52, 0.52, 0.08, mat(palette.metal, { metalness: 0.85 }), 0, 0.75, 0));
  g.add(cyl(0.06, 0.16, 0.55, mat(0xff7030, { emissive: 0xff4010, emissiveIntensity: 0.7, weather: false }), 0, 0.28, 0));
  return g;
}

function buildTurret(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.78, roughness: 0.32 });
  g.add(rbox(0.95, 0.16, 0.95, mat(palette.dark), 0, 0.1, 0, 0.04));
  g.add(cyl(0.3, 0.38, 0.58, hullM, 0, 0.48, 0));
  g.add(rbox(0.38, 0.26, 0.38, hullM, 0, 0.9, 0, 0.04));
  const len = recipe.rail ? 1.15 : 0.8;
  g.add(cyl(0.055, 0.07, len, metalM, 0, 0.95, len / 2 - 0.05, Math.PI / 2));
  g.add(sphere(0.1, mat(0x9fd4e4, { emissive: 0x407080, emissiveIntensity: 0.55, weather: false }), 0, 1.1, 0));
  return g;
}

function buildNexus(recipe, palette) {
  // Tiered futuristic HQ with comms arrays
  const g = new THREE.Group();
  groundShadow(g, 1.6, 1.3);
  const hullM = mat(palette.hull, { metalness: 0.45, roughness: 0.42 });
  const darkM = mat(palette.dark);
  const metalM = mat(palette.metal, { metalness: 0.75, roughness: 0.32 });
  g.add(rbox(2.0, 0.12, 2.0, darkM, 0, 0.08, 0, 0.04));
  g.add(rbox(1.6, 0.28, 1.6, hullM, 0, 0.3, 0, 0.05));
  // Side wings / barracks
  g.add(rbox(0.6, 0.85, 0.7, hullM, -0.7, 0.8, 0.35, 0.05));
  g.add(rbox(0.6, 0.85, 0.7, hullM, 0.7, 0.8, 0.35, 0.05));
  g.add(rbox(0.5, 0.55, 0.9, hullM, 0, 0.6, -0.55, 0.04));
  // Central keep
  g.add(rbox(0.85, 1.2, 0.85, hullM, 0, 1.05, 0, 0.06));
  g.add(rbox(1.0, 0.16, 1.0, metalM, 0, 1.7, 0, 0.04));
  g.add(rbox(0.55, 0.55, 0.55, hullM, 0, 2.0, 0, 0.05));
  // Comms dish + mast farm
  const dish = cyl(0.35, 0.08, 0.12, metalM, 0.45, 2.15, -0.35);
  dish.rotation.x = 0.6;
  g.add(dish);
  g.add(cyl(0.03, 0.03, 0.7, metalM, -0.35, 2.35, 0.3));
  g.add(sphere(0.2, mat(0x6eb0c8, { emissive: 0x306878, emissiveIntensity: 0.7, weather: false }), 0, 2.4, 0));
  addAntenna(g, palette, 0.3, 2.25, 0.3);
  addAntenna(g, palette, -0.3, 2.25, -0.25);
  addFactionStripe(g, palette, 1.4, 0.45);
  return g;
}

function buildReactor(recipe, palette) {
  // Cooling towers + glowing fusion core
  const g = new THREE.Group();
  groundShadow(g, 1.4, 1.1);
  const hullM = mat(palette.hull);
  const darkM = mat(palette.dark);
  g.add(rbox(1.4, 0.15, 1.2, darkM, 0, 0.1, 0, 0.04));
  // Twin cooling towers
  g.add(cyl(0.28, 0.38, 1.1, hullM, -0.45, 0.7, 0.15));
  g.add(cyl(0.28, 0.38, 1.1, hullM, 0.45, 0.7, 0.15));
  g.add(cyl(0.22, 0.22, 0.08, darkM, -0.45, 1.28, 0.15));
  g.add(cyl(0.22, 0.22, 0.08, darkM, 0.45, 1.28, 0.15));
  // Core containment
  g.add(cyl(0.4, 0.45, 0.7, hullM, 0, 0.5, -0.25));
  g.add(sphere(0.32, mat(0x7ec8e0, { emissive: 0x40a0c8, emissiveIntensity: 0.85, roughness: 0.2, weather: false }), 0, 0.55, -0.25));
  g.add(rbox(0.2, 0.5, 0.2, darkM, 0, 0.4, 0.45, 0.03));
  return g;
}

function buildRefinery(recipe, palette) {
  // Smelter hall + conveyors + chimneys
  const g = new THREE.Group();
  groundShadow(g, 1.4, 1.0);
  const hullM = mat(palette.hull);
  const darkM = mat(palette.dark);
  const metalM = mat(palette.metal, { metalness: 0.7 });
  g.add(rbox(1.5, 0.7, 0.9, hullM, 0, 0.45, 0, 0.05));
  // Smelter glow port
  g.add(rbox(0.35, 0.25, 0.08, mat(0xff6020, { emissive: 0xff4010, emissiveIntensity: 0.7, weather: false }), 0.55, 0.45, 0.48, 0.02));
  // Conveyor
  g.add(rbox(1.3, 0.1, 0.28, darkM, 0, 0.2, 0.55, 0.02));
  for (let i = -2; i <= 2; i++) {
    g.add(rbox(0.12, 0.06, 0.26, metalM, i * 0.24, 0.26, 0.55, 0.01));
  }
  // Chimneys
  g.add(cyl(0.1, 0.12, 1.15, metalM, -0.4, 1.05, -0.15));
  g.add(cyl(0.1, 0.12, 1.35, metalM, 0, 1.15, -0.15));
  g.add(cyl(0.1, 0.12, 1.0, metalM, 0.4, 0.98, -0.15));
  return g;
}

function buildMissile(recipe, palette) {
  // Launch tubes angled on a pad
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.78 });
  g.add(rbox(1.15, 0.35, 0.95, hullM, 0, 0.25, 0, 0.05));
  for (let i = -1; i <= 1; i++) {
    const tube = cyl(0.1, 0.1, 1.05, metalM, i * 0.28, 0.85, 0.05);
    tube.rotation.z = -0.35;
    g.add(tube);
    g.add(cyl(0.02, 0.1, 0.14, mat(palette.dark), i * 0.28 + 0.18, 1.35, 0.05, 0, -0.35));
  }
  g.add(rbox(0.35, 0.4, 0.35, hullM, -0.4, 0.55, -0.3, 0.03));
  return g;
}

function buildPylon(recipe, palette) {
  // Shield emitter ring on braced mast
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull, { metalness: 0.42 });
  const metalM = mat(palette.metal, { metalness: 0.8 });
  g.add(rbox(1.1, 0.14, 1.1, mat(palette.dark), 0, 0.08, 0, 0.04));
  g.add(rbox(0.7, 0.35, 0.7, hullM, 0, 0.35, 0, 0.05));
  g.add(cyl(0.12, 0.16, 1.0, hullM, 0, 0.95, 0));
  // Emitter ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.05, 10, 28),
    mat(0x7eb8cc, { emissive: 0x386878, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.25, weather: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.45;
  g.add(ring);
  g.add(sphere(0.18, mat(0xa0d8e8, { emissive: 0x5088a0, emissiveIntensity: 0.7, weather: false }), 0, 1.45, 0));
  g.add(rbox(0.08, 0.7, 0.08, metalM, -0.28, 0.85, -0.28, 0.02));
  g.add(rbox(0.08, 0.7, 0.08, metalM, 0.28, 0.85, 0.28, 0.02));
  return g;
}

function buildDepot(recipe, palette) {
  // Stacked shipping containers
  const g = new THREE.Group();
  groundShadow(g, 1.3, 1.0);
  const a = mat(palette.hull);
  const b = mat(palette.dark);
  const c = mat(palette.accent ?? palette.metal);
  g.add(rbox(1.4, 0.12, 1.0, mat(palette.dark), 0, 0.08, 0, 0.03));
  g.add(rbox(0.7, 0.4, 0.45, a, -0.35, 0.35, 0.15, 0.03));
  g.add(rbox(0.7, 0.4, 0.45, b, 0.35, 0.35, 0.15, 0.03));
  g.add(rbox(0.7, 0.4, 0.45, c, -0.2, 0.75, -0.15, 0.03));
  g.add(rbox(0.55, 0.35, 0.4, a, 0.35, 0.72, -0.2, 0.03));
  g.add(rbox(0.2, 0.55, 0.2, mat(palette.metal), 0.55, 0.45, 0.4, 0.02));
  return g;
}

function buildFactory(recipe, palette) {
  // Nano fabricator with robotic arms
  const g = new THREE.Group();
  groundShadow(g, 1.4, 1.1);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.75 });
  g.add(rbox(1.5, 0.55, 1.1, hullM, 0, 0.4, 0, 0.05));
  g.add(rbox(0.9, 0.45, 0.7, hullM, 0, 0.9, -0.1, 0.04));
  // Robotic arms
  g.add(cyl(0.06, 0.06, 0.55, metalM, -0.55, 0.95, 0.35, 0, Math.PI / 2));
  g.add(cyl(0.05, 0.05, 0.4, metalM, -0.85, 0.75, 0.35));
  g.add(rbox(0.18, 0.12, 0.18, metalM, -0.85, 0.55, 0.35, 0.02));
  g.add(cyl(0.06, 0.06, 0.55, metalM, 0.55, 0.95, 0.35, 0, Math.PI / 2));
  g.add(cyl(0.05, 0.05, 0.4, metalM, 0.85, 0.75, 0.35));
  g.add(rbox(0.18, 0.12, 0.18, metalM, 0.85, 0.55, 0.35, 0.02));
  // Print bed glow
  g.add(rbox(0.5, 0.05, 0.4, mat(0x60c8e0, { emissive: 0x3080a0, emissiveIntensity: 0.5, weather: false }), 0, 0.72, 0.35, 0.01));
  return g;
}

function buildLab(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull);
  g.add(rbox(1.3, 0.55, 1.0, hullM, 0, 0.38, 0, 0.05));
  g.add(rbox(0.9, 0.5, 0.7, hullM, 0, 0.9, 0, 0.04));
  g.add(rbox(0.7, 0.35, 0.08, mat(0x2a6080, { metalness: 0.9, roughness: 0.15, weather: false }), 0, 0.95, 0.38, 0.02));
  g.add(cyl(0.08, 0.08, 0.7, mat(palette.metal), 0.45, 1.15, -0.2));
  addAntenna(g, palette, -0.3, 1.15, -0.2);
  return g;
}

function buildTower(recipe, palette) {
  // Sensor / jammer / uplink mast with dishes
  const g = new THREE.Group();
  groundShadow(g);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.8 });
  g.add(rbox(0.7, 0.15, 0.7, mat(palette.dark), 0, 0.1, 0, 0.03));
  g.add(cyl(0.14, 0.22, 1.4, hullM, 0, 0.85, 0));
  const dish = cyl(0.4, 0.05, 0.1, metalM, 0.15, 1.55, 0);
  dish.rotation.z = 0.9;
  g.add(dish);
  g.add(sphere(0.16, mat(0x8ec8d8, { emissive: 0x407080, emissiveIntensity: 0.55, weather: false }), 0, 1.7, 0));
  addAntenna(g, palette, -0.1, 1.65, -0.1);
  return g;
}

function buildSilo(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(rbox(1.1, 0.2, 1.1, mat(palette.dark), 0, 0.12, 0, 0.04));
  g.add(cyl(0.45, 0.5, 1.4, mat(palette.hull), 0, 0.9, 0));
  g.add(cyl(0.48, 0.15, 0.25, mat(palette.dark), 0, 1.65, 0));
  g.add(rbox(0.35, 0.5, 0.35, mat(palette.metal), 0.55, 0.45, 0.4, 0.03));
  return g;
}

function buildDock(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.5, 1.0);
  const hullM = mat(palette.hull);
  g.add(rbox(1.8, 0.18, 1.1, mat(palette.dark), 0, 0.12, 0, 0.04));
  // Drydock walls
  g.add(rbox(0.2, 0.55, 1.0, hullM, -0.75, 0.45, 0, 0.03));
  g.add(rbox(0.2, 0.55, 1.0, hullM, 0.75, 0.45, 0, 0.03));
  g.add(rbox(1.5, 0.35, 0.25, hullM, 0, 0.35, -0.45, 0.03));
  // Crane
  g.add(cyl(0.06, 0.06, 1.0, mat(palette.metal), 0, 0.85, -0.35));
  g.add(rbox(0.9, 0.08, 0.08, mat(palette.metal), 0.2, 1.3, -0.35, 0.02));
  return g;
}

function buildPlant(recipe, palette) {
  // Geothermal: drilling rig + steam pipes
  const g = new THREE.Group();
  groundShadow(g, 1.3, 1.0);
  const hullM = mat(palette.hull);
  const metalM = mat(palette.metal, { metalness: 0.75 });
  g.add(rbox(1.2, 0.2, 1.1, mat(palette.dark), 0, 0.12, 0, 0.04));
  g.add(rbox(0.7, 0.55, 0.7, hullM, -0.25, 0.5, 0.1, 0.04));
  // Drill derrick
  g.add(rbox(0.08, 1.3, 0.08, metalM, 0.35, 0.9, -0.15, 0.01));
  g.add(rbox(0.08, 1.3, 0.08, metalM, 0.55, 0.9, -0.15, 0.01));
  g.add(rbox(0.08, 1.3, 0.08, metalM, 0.35, 0.9, 0.1, 0.01));
  g.add(rbox(0.08, 1.3, 0.08, metalM, 0.55, 0.9, 0.1, 0.01));
  g.add(rbox(0.35, 0.08, 0.35, metalM, 0.45, 1.55, -0.02, 0.02));
  g.add(cyl(0.05, 0.05, 0.8, metalM, 0.45, 1.1, -0.02));
  // Steam vent
  g.add(cyl(0.12, 0.12, 0.6, hullM, -0.4, 0.95, -0.3));
  g.add(sphere(0.2, mat(0xd0d8e0, { transparent: true, opacity: 0.35, weather: false }), -0.4, 1.35, -0.3));
  return g;
}

function buildOrbitalPad(recipe, palette) {
  const g = new THREE.Group();
  groundShadow(g, 1.3, 1.1);
  const metalM = mat(palette.metal, { metalness: 0.8 });
  const hullM = mat(palette.hull, { metalness: 0.55 });
  g.add(cyl(0.85, 0.85, 0.12, mat(palette.dark), 0, 0.08, 0));
  g.add(cyl(0.55, 0.55, 0.2, hullM, 0, 0.25, 0));
  if (recipe.exotic) {
    // Dark matter: exotic ring + core
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.06, 10, 32),
      mat(0x8060c0, { emissive: 0x5030a0, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3, weather: false }),
    );
    ring.rotation.x = Math.PI / 2.5;
    ring.position.y = 0.75;
    g.add(ring);
    g.add(sphere(0.28, mat(0x402060, { emissive: 0x8040c0, emissiveIntensity: 0.8, weather: false }), 0, 0.75, 0));
  } else {
    // Orbital collector: tracking dish
    const dish = cyl(0.55, 0.08, 0.12, metalM, 0, 0.7, 0);
    dish.rotation.x = 0.85;
    g.add(dish);
    g.add(cyl(0.05, 0.05, 0.55, metalM, 0, 0.55, 0));
    g.add(sphere(0.12, mat(0x8ec8d8, { emissive: 0x407080, emissiveIntensity: 0.5, weather: false }), 0, 0.95, -0.2));
  }
  return g;
}

function buildExplosion() {
  const g = new THREE.Group();
  // Layered fireball: white core → orange flame → dark smoke → sparks
  g.add(sphere(0.28, mat(0xfff8e0, { emissive: 0xffe080, emissiveIntensity: 2.2, transparent: true, opacity: 0.95, weather: false }), 0, 0.75, 0));
  g.add(sphere(0.55, mat(0xff9030, { emissive: 0xff6010, emissiveIntensity: 1.4, transparent: true, opacity: 0.88, weather: false }), 0, 0.7, 0));
  g.add(sphere(0.75, mat(0xe05018, { emissive: 0xc03008, emissiveIntensity: 0.7, transparent: true, opacity: 0.55, weather: false }), 0.05, 0.65, 0.05, 1.1, 0.95, 1.05));
  const smoke = mat(0x3a3834, { transparent: true, opacity: 0.42, roughness: 1, weather: false });
  g.add(sphere(0.48, smoke, -0.35, 1.25, 0.15, 1.5, 1.3, 1.4));
  g.add(sphere(0.42, smoke, 0.4, 1.45, -0.12, 1.35, 1.55, 1.25));
  g.add(sphere(0.38, smoke, 0.05, 1.75, 0.08, 1.25, 1.5, 1.2));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 0.55 + (i % 3) * 0.12;
    g.add(rbox(0.06, 0.06, 0.06, mat(0xffc060, { emissive: 0xff8020, emissiveIntensity: 1.2, weather: false }), Math.cos(a) * r, 0.55 + (i % 4) * 0.18, Math.sin(a) * r, 0.01));
  }
  return g;
}

function buildSmoke() {
  const g = new THREE.Group();
  const smoke = mat(0x4a4844, { transparent: true, opacity: 0.38, roughness: 1, weather: false });
  g.add(sphere(0.42, smoke, 0, 0.42, 0, 1.35, 0.85, 1.25));
  g.add(sphere(0.48, smoke, 0.18, 0.95, 0.1, 1.25, 1.35, 1.15));
  g.add(sphere(0.38, smoke, -0.12, 1.45, -0.05, 1.15, 1.45, 1.25));
  return g;
}

function buildMuzzle() {
  const g = new THREE.Group();
  g.add(sphere(0.18, mat(0xfff8e0, { emissive: 0xffd070, emissiveIntensity: 2, weather: false }), -0.25, 0.5, 0));
  g.add(cyl(0.06, 0.22, 0.65, mat(0xff9020, { emissive: 0xff6010, emissiveIntensity: 1.1, transparent: true, opacity: 0.75, weather: false }), 0.15, 0.5, 0, 0, Math.PI / 2));
  return g;
}

function buildWreck() {
  const g = new THREE.Group();
  groundShadow(g);
  g.add(rbox(0.95, 0.28, 0.55, mat(0x2a2420, { roughness: 0.95 }), 0.1, 0.26, 0, 0.04));
  g.add(rbox(0.42, 0.22, 0.32, mat(0x3a342e), -0.32, 0.38, 0.15, 0.03));
  g.add(rbox(0.22, 0.16, 0.42, mat(0x1a1814), 0.42, 0.2, -0.2, 0.02));
  return g;
}

function buildEmp() {
  const g = new THREE.Group();
  const ring = mat(0x7eb6c9, { emissive: 0x406080, emissiveIntensity: 0.7, transparent: true, opacity: 0.55, side: THREE.DoubleSide, weather: false });
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 36), ring);
  r1.rotation.x = -Math.PI / 2;
  r1.position.y = 0.5;
  g.add(r1);
  const r2 = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 36), ring);
  r2.rotation.x = -Math.PI / 2;
  r2.position.y = 0.5;
  g.add(r2);
  g.add(sphere(0.16, mat(0xc8e8f0, { emissive: 0xa0d0e0, emissiveIntensity: 0.9, weather: false }), 0, 0.5, 0));
  return g;
}

function buildBeam() {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.04, 2.0, mat(0x9fd4e4, { emissive: 0x7eb6c9, emissiveIntensity: 1.1, weather: false }), 0, 0.5, 0, 0, Math.PI / 2));
  return g;
}

function buildBolt() {
  const g = new THREE.Group();
  g.add(sphere(0.2, mat(0x6ec4a0, { emissive: 0x40a080, emissiveIntensity: 0.95, weather: false }), 0, 0.5, 0));
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
    g.add(rbox(0.8, 0.8, 0.8, mat(0x888888), 0, 0.4, 0));
    return g;
  }
  return builder(recipe, palette);
}

export function createRenderer(width, height) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  return renderer;
}

export function createStudioScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = null;

  // Room environment for metal reflections
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = new RoomEnvironment();
    scene.environment = pmrem.fromScene(env, 0.04).texture;
    env.dispose();
    pmrem.dispose();
  } catch (e) {
    console.warn("PMREM env failed", e);
  }

  scene.add(new THREE.AmbientLight(0xd8e4f0, 0.55));
  scene.add(new THREE.HemisphereLight(0xe8f0f8, 0x4a5538, 0.7));

  const key = new THREE.DirectionalLight(0xfff6e8, 2.1);
  key.position.set(4.5, 8, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 2;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb0d0f0, 0.75);
  fill.position.set(-4, 3.5, -2.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffe8c8, 0.65);
  rim.position.set(-2.5, 2.5, 5);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 40),
    new THREE.ShadowMaterial({ opacity: 0.28 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  return scene;
}

export function createIsoCamera(width, height) {
  const cam = new THREE.PerspectiveCamera(28, width / height, 0.1, 50);
  cam.position.set(2.9, 2.5, 2.9);
  cam.lookAt(0, 0.7, 0);
  return cam;
}

/**
 * Render at native size; caller may downscale from 2×.
 * @param yawRad world yaw — 0 = default +X facing (east / screen-right)
 */
export function renderRecipe(
  renderer,
  scene,
  camera,
  recipe,
  frame = "idle",
  yawRad = 0,
) {
  const toRemove = [];
  scene.traverse((o) => {
    if (o.userData?.isUnit) toRemove.push(o);
  });
  toRemove.forEach((o) => scene.remove(o));

  const model = buildModel(recipe);
  model.userData.isUnit = true;
  model.rotation.y = yawRad;

  if (frame === "fire" && (recipe.kind === "tank" || recipe.kind === "hover" || recipe.kind === "mech" || recipe.kind === "turret")) {
    model.position.y = 0.02;
  }
  if (frame === "move") {
    model.position.y = 0.03;
  }
  if (frame === "death") {
    model.rotation.z = 0.45;
    model.position.y = 0.08;
  }

  scene.add(model);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}
