#!/usr/bin/env node
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force/";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-hud-train";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name);
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
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
  });
}

async function clickBarracks(page) {
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const tid = s.selectedTerritoryId;
    const b = s.territories[tid].buildings.find(
      (x) => x.buildingId === "barracks",
    );
    if (!b) return;
    const CELL = window.matchMedia(
      "(orientation: landscape) and (max-height: 500px)",
    ).matches
      ? 52
      : 84;
    const pad = [...document.querySelectorAll(".rf-base__pad")].find((el) => {
      const left = parseInt(el.style.left, 10);
      const top = parseInt(el.style.top, 10);
      return left === b.x * CELL && top === b.y * CELL;
    });
    pad?.click();
  });
  await page.waitForSelector(".rf-base__ctx", { timeout: 5000 });
  // Wait for layout anchor (visibility:visible after clamp)
  await page.waitForFunction(() => {
    const m = document.querySelector(".rf-base__ctx");
    if (!m) return false;
    const s = getComputedStyle(m);
    return s.visibility !== "hidden" && parseFloat(s.left) > 0;
  });
}

{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await boot(page);

  // Energy tooltip — verify wrap stays in box
  await page.locator(".rf-resource--energy").click();
  await page.waitForTimeout(250);
  await shot(page, "risk-force-hud-resource-tooltip");
  await page.locator(".rf-resource--energy").click();

  // Base + Barracks context menu
  const owned = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return Object.entries(s.territories).find(
      ([, t]) =>
        t.owner === "player" &&
        t.buildings.some((b) => b.buildingId === "barracks"),
    )?.[0];
  });
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...window.__RF__.getState(),
          selectedTerritoryId: tid,
        },
      },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "base" } });
  }, owned);
  await page.waitForTimeout(400);
  await clickBarracks(page);
  await page.waitForTimeout(200);
  await shot(page, "risk-force-building-train-menu");

  await ctx.close();
}

await browser.close();
console.log("Done");
