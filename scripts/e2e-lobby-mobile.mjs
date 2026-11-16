#!/usr/bin/env node
/**
 * Mobile landscape Solo Campaign lobby: scroll, tap menus, Start reachable.
 * Spawns vite preview against dist/ unless RF_URL is set.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium } from "playwright";

const BASE_PATH = "/Risk-force/";
const VIEWPORTS = [
  { name: "844x390", width: 844, height: 390 },
  { name: "667x375", width: 667, height: 375 },
  { name: "932x430", width: 932, height: 430 },
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 304) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function withPreview(run) {
  if (process.env.RF_URL) {
    await run(process.env.RF_URL.replace(/\/?$/, "/"));
    return;
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}${BASE_PATH}`;
  const child = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: new URL("..", import.meta.url).pathname,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    },
  );
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  try {
    await waitUrl(base);
    await run(base);
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    if (!child.killed) child.kill("SIGKILL");
    if (child.exitCode && child.exitCode !== 0 && stderr) {
      console.error(stderr.slice(-800));
    }
  }
}

async function openLobby(page, base) {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-menu", { timeout: 20000 });
  await page.getByRole("button", { name: /New Campaign/i }).click();
  await page.waitForSelector('[data-testid="lobby-screen"]', { timeout: 10000 });
}

async function assertStartReachable(page) {
  const start = page.getByTestId("lobby-start");
  await assert(await start.isVisible(), "Start button missing");
  const box = await start.boundingBox();
  assert(box, "Start has no box");
  const vp = page.viewportSize();
  assert(vp, "no viewport");
  assert(
    box.y >= 0 && box.y + box.height <= vp.height + 1,
    `Start clipped: y=${box.y} h=${box.height} vp=${vp.height}`,
  );
  assert(box.height >= 40, `Start tap target too small: ${box.height}`);
}

async function assertBodyScrollsOrFits(page) {
  const info = await page.evaluate(() => {
    const lobby = document.querySelector(".rf-lobby");
    const body = document.querySelector(".rf-lobby__body");
    if (!lobby || !body) return null;
    const lr = lobby.getBoundingClientRect();
    return {
      lobbyH: lr.height,
      bodyScroll: body.scrollHeight,
      bodyClient: body.clientHeight,
      canScroll: body.scrollHeight > body.clientHeight + 2,
      overflow: getComputedStyle(body).overflowY,
    };
  });
  assert(info, "lobby/body missing");
  const vp = page.viewportSize();
  assert(vp, "no viewport");
  assert(
    info.lobbyH <= vp.height + 2,
    `Lobby taller than viewport: ${info.lobbyH} > ${vp.height}`,
  );
  if (info.bodyScroll > info.bodyClient + 4) {
    assert(
      info.canScroll && /auto|scroll|overlay/.test(info.overflow),
      `Body content overflows but cannot scroll (${info.overflow})`,
    );
    await page.evaluate(() => {
      const body = document.querySelector(".rf-lobby__body");
      body.scrollTop = body.scrollHeight;
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      const body = document.querySelector(".rf-lobby__body");
      body.scrollTop = 0;
    });
  }
}

async function tapThroughMenus(page) {
  // Difficulty segmented control
  const hard = page.getByRole("radio", { name: /^Hard$/i });
  await hard.tap();
  assert(
    (await hard.getAttribute("aria-checked")) === "true",
    "Hard difficulty not selected",
  );
  await page.getByRole("radio", { name: /^Normal$/i }).tap();

  // AI stepper
  const aiPlus = page.getByRole("button", { name: /Increase AI/i });
  await aiPlus.tap();
  const aiVal = await page.getByTestId("ai-count").innerText();
  assert(Number(aiVal) === 3, `Expected AI 3 after bump, got ${aiVal}`);
  await page.getByRole("button", { name: /Decrease AI/i }).tap();

  // Doctrine cards
  const spectre = page.getByRole("radio", { name: /Spectre/i });
  await spectre.scrollIntoViewIfNeeded();
  await spectre.tap();
  assert(
    (await spectre.getAttribute("aria-checked")) === "true",
    "Spectre doctrine not selected",
  );
  await page.getByRole("radio", { name: /Vanguard/i }).tap();

  // VP checkbox
  const vp = page.getByRole("checkbox", { name: /Victory points/i });
  await vp.scrollIntoViewIfNeeded();
  await vp.tap();
  assert((await vp.getAttribute("aria-checked")) === "true", "VP not enabled");
  await page.waitForSelector('[data-testid="turn-limit"]', { timeout: 3000 });
  await vp.tap();

  // Callsign field tappable
  const name = page.getByLabel(/Callsign player 1/i);
  await name.scrollIntoViewIfNeeded();
  await name.tap();
  await name.fill("Hayden");
  assert((await name.inputValue()) === "Hayden", "Callsign not editable");
}

async function startGame(page) {
  const start = page.getByTestId("lobby-start");
  await assertStartReachable(page);
  await start.tap();
  await page.waitForSelector(".rf-map, .rf-shell .rf-hud", { timeout: 20000 });
  const onMap = await page.locator(".rf-map").count();
  assert(onMap > 0, "Game did not start — map missing");
}

async function runViewport(browser, base, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await openLobby(page, base);
    await assertBodyScrollsOrFits(page);
    await assertStartReachable(page);
    await tapThroughMenus(page);
    await assertStartReachable(page);
    await startGame(page);
    console.log(`ok ${vp.name}`);
  } catch (err) {
    err.message = `[${vp.name}] ${err.message}`;
    throw err;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await withPreview(async (base) => {
    for (const vp of VIEWPORTS) {
      await runViewport(browser, base, vp);
    }
  });
  console.log("e2e-lobby-mobile: all viewports passed");
} finally {
  await browser.close();
}
