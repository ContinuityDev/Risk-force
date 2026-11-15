#!/usr/bin/env node
/**
 * World / mid / deep map shots showing territory building minis.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:5173/Risk-force/";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-map-bldgs";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name);
}

function wheelAt(page, svgSel, clientX, clientY, deltaY, times) {
  return page.evaluate(
    ({ sel, x, y, dy, n }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("missing svg");
      for (let i = 0; i < n; i++) {
        el.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            deltaY: dy,
          }),
        );
      }
    },
    { sel: svgSel, x: clientX, y: clientY, dy: deltaY, n: times },
  );
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator(".rf-menu button.primary").click();
  await page.waitForSelector(".rf-lobby");
  await page.locator(".rf-lobby button.primary").click();
  await page.waitForSelector(".rf-map");
  await page.waitForFunction(() => window.__RF__?.dispatch, null, {
    timeout: 20000,
  });
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "NEW_GAME",
      payload: {
        humanCount: 1,
        aiCount: 2,
        multiplayerMode: "solo",
        seed: 77,
      },
    });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
  });
  // Wait until at least one territory has buildings
  await page.waitForFunction(() => {
    const s = window.__RF__.getState();
    return Object.values(s.territories).some((t) => t.buildings?.length > 0);
  });
}

async function suite(page, tag) {
  await boot(page);

  const svgBox = await page.locator(".rf-map__svg").boundingBox();
  if (!svgBox) throw new Error("no map svg");
  const cx = svgBox.x + svgBox.width * 0.5;
  const cy = svgBox.y + svgBox.height * 0.5;

  // Selection autofocus zooms in — wheel fully out for true world framing
  await wheelAt(page, ".rf-map__svg", cx, cy, 200, 50);
  await page.waitForTimeout(450);
  await shot(page, `risk-force-map-bldgs-world${tag}`);

  // Mid zoom — Europe (short building rows + +N)
  const euroX = svgBox.x + svgBox.width * 0.55;
  const euroY = svgBox.y + svgBox.height * 0.24;
  await wheelAt(page, ".rf-map__svg", euroX, euroY, -120, 10);
  await page.waitForTimeout(500);
  await shot(page, `risk-force-map-bldgs-mid${tag}`);

  // Deep zoom — pick a core with buildings; selection autofocuses, then zoom in place
  const deepTarget = await page.evaluate(() => {
    const s = window.__RF__.getState();
    const hit = Object.entries(s.territories).find(
      ([, t]) => (t.buildings?.length ?? 0) >= 5,
    );
    return hit?.[0] ?? s.selectedTerritoryId;
  });
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, deepTarget);
  await page.waitForTimeout(450);
  // Zoom toward the frame center (selected territory), not Europe
  const box2 = await page.locator(".rf-map__svg").boundingBox();
  if (box2) {
    await wheelAt(
      page,
      ".rf-map__svg",
      box2.x + box2.width * 0.38,
      box2.y + box2.height * 0.5,
      -120,
      16,
    );
  }
  await page.waitForTimeout(500);
  await shot(page, `risk-force-map-bldgs-deep${tag}`);
}

{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await suite(page, "");
  await ctx.close();
}

{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  await suite(page, "-desktop");
  await ctx.close();
}

await browser.close();
console.log("Done");
