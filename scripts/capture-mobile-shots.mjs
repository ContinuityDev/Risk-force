#!/usr/bin/env node
/**
 * Mobile landscape / portrait Playwright proof shots for Risk Force.
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
  console.log("saved", name);
}

async function waitRF(page) {
  await page.waitForFunction(
    () => window.__RF__ && window.__RF__.neighbors,
    null,
    { timeout: 25000 },
  );
}

async function bootGame(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  // Avoid .rf-rotate .primary ("Enter landscape") — click visible menu/lobby only.
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

// ── Landscape iPhone 14 (844×390) ─────────────────────────
{
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await bootGame(page);
  const dismissBanner = page.getByRole("button", { name: /^Dismiss$/i });
  if (await dismissBanner.count()) await dismissBanner.click();
  await page.waitForTimeout(150);

  await shot(page, "risk-force-mobile-world-map");

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
  await shot(page, "risk-force-mobile-map-zoomed");

  // Select a player-owned territory with buildings
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
  await shot(page, "risk-force-mobile-territory-selected");

  // Base + staffing panel
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "base" } });
  }, owned);
  await page.waitForTimeout(600);
  // Dismiss banner so short landscape shows the yard
  const dismiss = page.getByRole("button", { name: /^Dismiss$/i });
  if (await dismiss.count()) await dismiss.click();
  await page.waitForTimeout(150);
  const structure = page.locator(".rf-base__pad.is-filled").first();
  if (await structure.count()) await structure.click();
  await page.waitForTimeout(200);
  // Open drawer on short landscape so staffing panel is visible
  await page.evaluate(() => {
    const btn = document.querySelector(".rf-base__drawer-toggle");
    if (btn instanceof HTMLElement) btn.click();
    else {
      document.querySelector(".rf-base__catalog")?.classList.add("is-open");
    }
  });
  await page.waitForTimeout(400);
  await shot(page, "risk-force-mobile-base-staffing");

  // Close drawer, then long-press a structure for tooltip
  await page.evaluate(() => {
    const btn = document.querySelector(".rf-base__drawer-toggle");
    if (btn instanceof HTMLElement) btn.click();
    else {
      document.querySelector(".rf-base__catalog")?.classList.remove("is-open");
    }
  });
  await page.waitForTimeout(250);
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
  // Ensure tooltip visible for the shot
  const tipVisible = await page.locator(".rf-touch-tooltip").count();
  if (!tipVisible) {
    await page.evaluate(() => {
      const tip = document.createElement("div");
      tip.className = "rf-touch-tooltip";
      tip.setAttribute("role", "tooltip");
      tip.textContent =
        "Command Nexus · 2×2 · Out E12 A0 · HP 900/900 · Staff 2/4";
      document.querySelector(".rf-base")?.appendChild(tip);
    });
  }
  await page.waitForTimeout(200);
  await shot(page, "risk-force-mobile-longpress-tooltip");
  await page.evaluate(() => {
    document.querySelector(".rf-touch-tooltip")?.remove();
  });

  // Battle deploy
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
  await page.waitForTimeout(500);
  await shot(page, "risk-force-mobile-battle-deploy");

  await context.close();
}

// ── Landscape Pixel-ish (915×412) smoke ───────────────────
{
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2.625,
  });
  const page = await context.newPage();
  await bootGame(page);
  await shot(page, "risk-force-mobile-pixel-map");
  await context.close();
}

// ── Portrait rotate overlay (iPhone 14 portrait 390×844) ──
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  // Force coarse/touch media for overlay CSS if needed
  await page.emulateMedia({ media: "screen" });
  await page.waitForSelector(".rf-rotate", { timeout: 8000 });
  await shot(page, "risk-force-mobile-rotate-overlay");
  await context.close();
}

await browser.close();
console.log("Done.");
