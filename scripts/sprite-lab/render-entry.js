/**
 * Browser entry — SpriteLab API for Playwright.
 * Renders at 2× (512) then downscales to 256 for crisp AA edges.
 * Supports multi-direction yaw baking for facing sheets.
 */
import {
  createIsoCamera,
  createRenderer,
  createStudioScene,
  renderRecipe,
} from "./build-models.js";
import {
  BUILDING_RECIPES,
  DEFAULT_DIRECTIONS,
  FX_RECIPES,
  UNIT_RECIPES,
} from "./recipes.mjs";

const OUT = 256;
const HI = 512;
const FRAMES = ["idle", "move", "fire", "death"];

let renderer;
let scene;
let camera;
let downscaleCanvas;

function ensure() {
  if (renderer) return;
  renderer = createRenderer(HI, HI);
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.left = "0";
  renderer.domElement.style.top = "0";
  scene = createStudioScene(renderer);
  camera = createIsoCamera(HI, HI);
  downscaleCanvas = document.createElement("canvas");
  downscaleCanvas.width = OUT;
  downscaleCanvas.height = OUT;
}

function downscale(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = downscaleCanvas.getContext("2d");
      ctx.clearRect(0, 0, OUT, OUT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, OUT, OUT);
      resolve(downscaleCanvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function tableFor(category) {
  return category === "buildings"
    ? BUILDING_RECIPES
    : category === "fx"
      ? FX_RECIPES
      : UNIT_RECIPES;
}

export function listRecipes() {
  return {
    units: Object.entries(UNIT_RECIPES).map(([id, r]) => ({
      id,
      ...r,
      directions: r.directions ?? DEFAULT_DIRECTIONS,
    })),
    buildings: Object.entries(BUILDING_RECIPES).map(([id, r]) => ({
      id,
      ...r,
      directions: r.directions ?? 1,
    })),
    fx: Object.entries(FX_RECIPES).map(([id, r]) => ({ id, ...r })),
  };
}

export async function renderOne(id, category = "units", frame = "idle", yawRad = 0) {
  ensure();
  const recipe = tableFor(category)[id];
  if (!recipe) throw new Error(`Unknown recipe ${id}`);
  const hi = renderRecipe(
    renderer,
    scene,
    camera,
    { id, ...recipe },
    frame,
    yawRad,
  );
  const dataUrl = await downscale(hi);
  return { id, file: recipe.file, frame, yawRad, dataUrl };
}

export async function renderAllFrames(id, category = "units") {
  const out = [];
  for (const frame of FRAMES) {
    out.push(await renderOne(id, category, frame, 0));
  }
  return out;
}

/**
 * Bake horizontal strip: dir 0..N-1 at idle pose.
 * Frame 0 = game facing 0 (east / screen-right). Iso camera sits on the
 * +X/+Z diagonal, so world yaw π/4 points the model's +X along screen-right.
 * Game facing increases clockwise (Y-down); three.js Y yaw is CCW from above,
 * so: yaw = π/4 - angle.
 */
export async function renderDirections(id, category = "units") {
  ensure();
  const recipe = tableFor(category)[id];
  if (!recipe) throw new Error(`Unknown recipe ${id}`);
  const n = recipe.directions ?? (category === "units" ? DEFAULT_DIRECTIONS : 1);
  const frames = [];
  const ISO_YAW_OFFSET = Math.PI / 4;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const yaw = ISO_YAW_OFFSET - angle;
    frames.push(await renderOne(id, category, "idle", yaw));
  }
  // Compose strip in-page
  const canvas = document.createElement("canvas");
  canvas.width = OUT * n;
  canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < frames.length; i++) {
    const img = new Image();
    img.src = frames[i].dataUrl;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    ctx.drawImage(img, i * OUT, 0);
  }
  return {
    id,
    file: recipe.file.replace(/\.png$/, "-dirs.png"),
    directions: n,
    dataUrl: canvas.toDataURL("image/png"),
    frames: frames.map((f) => f.dataUrl),
  };
}

window.SpriteLab = {
  listRecipes,
  renderOne,
  renderAllFrames,
  renderDirections,
  FRAMES,
  WIDTH: OUT,
  HEIGHT: OUT,
  DEFAULT_DIRECTIONS,
};
