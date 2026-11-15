/**
 * Browser entry — exposes SpriteLab API for Playwright.
 */
import {
  createIsoCamera,
  createRenderer,
  createStudioScene,
  renderRecipe,
} from "./build-models.js";
import {
  BUILDING_RECIPES,
  FX_RECIPES,
  UNIT_RECIPES,
} from "./recipes.mjs";

const WIDTH = 256;
const HEIGHT = 256;
const FRAMES = ["idle", "move", "fire", "death"];

let renderer;
let scene;
let camera;

function ensure() {
  if (renderer) return;
  renderer = createRenderer(WIDTH, HEIGHT);
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.left = "0";
  renderer.domElement.style.top = "0";
  scene = createStudioScene();
  camera = createIsoCamera(WIDTH, HEIGHT);
}

export function listRecipes() {
  return {
    units: Object.entries(UNIT_RECIPES).map(([id, r]) => ({ id, ...r })),
    buildings: Object.entries(BUILDING_RECIPES).map(([id, r]) => ({ id, ...r })),
    fx: Object.entries(FX_RECIPES).map(([id, r]) => ({ id, ...r })),
  };
}

export function renderOne(id, category = "units", frame = "idle") {
  ensure();
  const table =
    category === "buildings"
      ? BUILDING_RECIPES
      : category === "fx"
        ? FX_RECIPES
        : UNIT_RECIPES;
  const recipe = table[id];
  if (!recipe) throw new Error(`Unknown recipe ${id}`);
  const dataUrl = renderRecipe(renderer, scene, camera, { id, ...recipe }, frame);
  return { id, file: recipe.file, frame, dataUrl };
}

export function renderAllFrames(id, category = "units") {
  return FRAMES.map((frame) => renderOne(id, category, frame));
}

// Attach for Playwright evaluate
window.SpriteLab = { listRecipes, renderOne, renderAllFrames, FRAMES, WIDTH, HEIGHT };
