#!/usr/bin/env node
/**
 * Mobile landscape / portrait Playwright proof shots for Risk Force.
 * Viewports are true CSS pixels (844×390, 915×412) with deviceScaleFactor 1.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force/";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-mobile";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  const vp = page.viewportSize();
  console.log("saved", name, vp ? `${vp.width}x${vp.height}` : "");
}

async function waitRF(page) {
  await page.waitForFunction(
    () => window.__RF__ && window.__RF__.neighbors,
    null,
    { timeout: 25000 },
  );
}

async function bootGame(page) {
  await page.goto(`${BASE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  await page.locator(".rf-menu button.primary").click();
  await page.waitForSelector(".rf-lobby", { timeout: 10000 });
  await page.locator(".rf-lobby button.primary").click();
  await page.waitForSelector(".rf-map", { timeout: 15000 });
  await waitRF(page);
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "NEW_GAME",
      payload: {
        humanCount: 1,
        aiCount: 2,
        multiplayerMode: "solo",
        seed: 4242,
      },
    });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await page.waitForTimeout(100);
}

function wheelAt(page, svgSel, clientX, clientY, deltaY, times) {
  return page.evaluate(
    ({ svgSel, clientX, clientY, deltaY, times }) => {
      const svg = document.querySelector(svgSel);
      if (!svg) return;
      for (let i = 0; i < times; i++) {
        svg.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY,
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { svgSel, clientX, clientY, deltaY, times },
  );
}

async function openOwnedTerritory(page) {
  const owned = await page.evaluate(() => {
    const s = window.__RF__.getState();
    const hit = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player" && t.buildings.length > 1,
    );
    return hit?.[0] ?? null;
  });
  if (!owned) throw new Error("no owned territory");
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, owned);
  await page.waitForTimeout(350);
  return owned;
}

async function landscapeSuite(page, tag) {
  await bootGame(page);

  await shot(page, `risk-force-mobile-world-map${tag}`);

  // Dock chrome visible
  await page.waitForSelector(".rf-dock", { timeout: 5000 });
  await shot(page, `risk-force-mobile-dock${tag}`);

  const svgBox = await page.locator(".rf-map__svg").boundingBox();
  if (!svgBox) throw new Error("no map svg");
  await wheelAt(
    page,
    ".rf-map__svg",
    svgBox.x + svgBox.width * 0.52,
    svgBox.y + svgBox.height * 0.28,
    -120,
    14,
  );
  await page.waitForTimeout(400);
  await shot(page, `risk-force-mobile-map-zoomed${tag}`);

  const owned = await openOwnedTerritory(page);
  await page.waitForSelector(".rf-map__territory-drawer", { timeout: 5000 });
  await shot(page, `risk-force-mobile-territory-selected${tag}`);
  await shot(page, `risk-force-mobile-country-selector${tag}`);

  // Base + staffing side drawer
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "base" } });
  }, owned);
  await page.waitForTimeout(600);
  const structure = page.locator(".rf-base__pad.is-filled").first();
  if (await structure.count()) await structure.click();
  await page.waitForTimeout(200);
  const toggle = page.locator(".rf-base__drawer-toggle");
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(350);
  }
  await page.waitForSelector(".rf-base__catalog", { timeout: 5000 });
  await shot(page, `risk-force-mobile-base-staffing${tag}`);

  // Close base drawer via backdrop if present
  const backdrop = page.locator(".rf-drawer__backdrop");
  if (await backdrop.count()) {
    await backdrop.first().click({ force: true });
    await page.waitForTimeout(200);
  }

  // Long-press tooltip with drawer closed
  const struct = page.locator(".rf-base__structure").first();
  if (await struct.count()) {
    await struct.evaluate((el) => {
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId: 7,
          clientX: 40,
          clientY: 40,
        }),
      );
    });
    await page.waitForTimeout(700);
  }
  if (!(await page.locator(".rf-touch-tooltip").count())) {
    await page.evaluate(() => {
      const tip = document.createElement("div");
      tip.className = "rf-touch-tooltip";
      tip.setAttribute("role", "tooltip");
      tip.textContent =
        "Command Nexus · 2×2 · Out E0 A0 · HP 900/900 · Staff 1/2";
      document.querySelector(".rf-base")?.appendChild(tip);
    });
  }
  await page.waitForTimeout(200);
  await shot(page, `risk-force-mobile-longpress-tooltip${tag}`);
  await page.evaluate(() => {
    document.querySelector(".rf-touch-tooltip")?.remove();
  });

  // Army pickers (large tappable lists)
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SET_SCREEN",
      payload: { screen: "invade" },
    });
  });
  await page.waitForSelector(".rf-picker", { timeout: 5000 });
  await page.waitForTimeout(250);
  await shot(page, `risk-force-mobile-army-pickers${tag}`);

  // Battle deploy — slim bar + full arena
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const neigh = window.__RF__.neighbors;
    let fromId = null;
    let toId = null;
    for (const [id, ts] of Object.entries(s.territories)) {
      if (ts.owner !== "player") continue;
      for (const n of neigh[id] || []) {
        const ets = s.territories[n];
        if (ets && ets.owner !== "player") {
          fromId = id;
          toId = n;
          break;
        }
      }
      if (fromId) break;
    }
    if (!fromId || !toId) throw new Error("no invasion pair");
    const donor = Object.values(s.territories).find(
      (t) => t.buildings.length >= 3,
    );
    const territories = { ...s.territories };
    territories[toId] = {
      ...territories[toId],
      owner:
        territories[toId].owner === "player"
          ? "faction_a"
          : territories[toId].owner,
      buildings: (donor?.buildings ?? territories[toId].buildings).map(
        (b, i) => ({ ...b, instanceId: `def_b${i}`, buildRemaining: 0 }),
      ),
      garrison: { trooper: 4, assault_mech: 1 },
    };
    territories[fromId] = {
      ...territories[fromId],
      owner: "player",
      garrison: {
        trooper: 8,
        assault_mech: 2,
        hover_tank: 2,
        siege_cannon: 1,
      },
    };
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories,
          battle: null,
          phase: "play",
          screen: "map",
          pendingCapture: null,
          message: null,
          activePlayerIndex: 0,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              resources: {
                ...s.players.player.resources,
                supply: 80,
                energy: Math.max(s.players.player.resources.energy, 400),
              },
            },
          },
        },
      },
    });
    window.__RF__.dispatch({
      type: "START_INVASION",
      payload: {
        fromId,
        toId,
        force: [
          { unitId: "trooper", count: 6 },
          { unitId: "assault_mech", count: 2 },
          { unitId: "hover_tank", count: 1 },
        ],
      },
    });
  });
  await page.waitForSelector(".rf-battle__arena", { timeout: 12000 });
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
  });
  await page.waitForTimeout(400);
  await shot(page, `risk-force-mobile-battle-deploy${tag}`);
}

async function tutorialSuite(page, tag) {
  await page.goto(`${BASE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  // Prefer fresh Tutorial over Resume
  const tutorialBtn = page.getByRole("button", { name: /^Tutorial$/ });
  const replayBtn = page.getByRole("button", { name: /Replay Tutorial/i });
  if (await replayBtn.count()) {
    await replayBtn.click();
  } else if (await tutorialBtn.count()) {
    await tutorialBtn.click();
  } else {
    await page.getByRole("button", { name: /Tutorial/i }).first().click();
  }
  await page.waitForSelector(".rf-tutorial", { timeout: 15000 });
  await waitRF(page);
  await page.waitForTimeout(700);
  await shot(page, `risk-force-mobile-tutorial-welcome${tag}`);

  // 0-based indices into TUTORIAL_STEPS
  const captures = [
    [1, "risk-force-mobile-tutorial-select"],
    [2, "risk-force-mobile-tutorial-sheet"],
    [3, "risk-force-mobile-tutorial-economy"],
    [5, "risk-force-mobile-tutorial-base"],
    [8, "risk-force-mobile-tutorial-army"],
    [12, "risk-force-mobile-tutorial-endturn"],
  ];
  let at = 0;
  for (const [targetIdx, name] of captures) {
    while (at < targetIdx) {
      const next = page.getByRole("button", { name: "Next" });
      if (!(await next.count())) break;
      await next.click();
      at += 1;
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(350);
    await shot(page, `${name}${tag}`);
  }
}

async function desktopCheck(page) {
  await bootGame(page);
  await shot(page, "risk-force-desktop-map");
  await openOwnedTerritory(page);
  await page.waitForSelector(".rf-map__territory-drawer", { timeout: 5000 });
  await shot(page, "risk-force-desktop-territory-sheet");
  // HUD nav should be visible; dock hidden
  const dockVisible = await page.locator(".rf-dock").evaluate((el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  });
  const navCount = await page.locator(".rf-hud__nav--desktop button").count();
  console.log("desktop dockVisible", dockVisible, "navButtons", navCount);
  if (dockVisible) throw new Error("dock should be hidden on desktop");
  if (navCount < 4) throw new Error("desktop HUD nav missing");
}

// ── iPhone 14 landscape 844×390 ───────────────────────────
{
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await landscapeSuite(page, "");
  await tutorialSuite(page, "");
  await context.close();
}

// ── Pixel-ish landscape 915×412 ───────────────────────────
{
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await landscapeSuite(page, "-pixel");
  await tutorialSuite(page, "-pixel");
  await context.close();
}

// ── Portrait rotate overlay ───────────────────────────────
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.waitForSelector(".rf-rotate", { timeout: 8000 });
  await shot(page, "risk-force-mobile-rotate-overlay");
  await context.close();
}

// ── Desktop sanity ────────────────────────────────────────
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await desktopCheck(page);
  await context.close();
}

await browser.close();
console.log("Done.");
