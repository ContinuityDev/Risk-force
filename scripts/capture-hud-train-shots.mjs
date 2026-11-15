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

async function suite(page, tag) {
  await boot(page);

  // HUD icons + labels
  await shot(page, `risk-force-hud-resources${tag}`);

  // Open energy tooltip
  await page.locator('.rf-resource--energy').click();
  await page.waitForTimeout(200);
  await shot(page, `risk-force-hud-resource-tooltip${tag}`);
  await page.locator('.rf-resource--energy').click();

  // Open base on owned territory with barracks
  const owned = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return Object.entries(s.territories).find(
      ([, t]) =>
        t.owner === "player" &&
        t.buildings.some((b) => b.buildingId === "barracks"),
    )?.[0];
  });
  await page.evaluate((tid) => {
    // Drain alloy so unaffordable costs show
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          selectedTerritoryId: tid,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              resources: {
                ...s.players.player.resources,
                alloy: 2,
                energy: 40,
              },
            },
          },
        },
      },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "base" } });
  }, owned);
  await page.waitForTimeout(400);

  const toggle = page.locator(".rf-base__drawer-toggle");
  if (await toggle.count()) await toggle.click();
  await page.waitForTimeout(200);

  // Unaffordable catalog cost (Vehicle Factory needs alloy)
  const factory = page.locator(".rf-base__catalog li button", {
    hasText: "Vehicle Factory",
  });
  if (await factory.count()) {
    await factory.first().click({ force: true });
    await page.waitForTimeout(250);
  } else {
    // scroll catalog to factory
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".rf-base__catalog li button")].find(
        (b) => b.textContent?.includes("Vehicle Factory"),
      );
      btn?.scrollIntoView({ block: "center" });
      btn?.click();
    });
    await page.waitForTimeout(250);
  }
  await shot(page, `risk-force-unaffordable-cost${tag}`);

  // Select barracks on grid — find pad with barracks via evaluate click
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const tid = s.selectedTerritoryId;
    const barracks = s.territories[tid].buildings.find(
      (b) => b.buildingId === "barracks",
    );
    if (!barracks) return;
    // Click corresponding pad button
    const pads = [...document.querySelectorAll(".rf-base__pad")];
    const cell = document.querySelector(
      `.rf-base__pad[style*="left: ${barracks.x * (window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches ? 52 : 84)}px"]`,
    );
    // Fallback: dispatch selection via state + open train
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
  });

  // Click structure by scanning pads
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
  await page.waitForTimeout(300);
  if (await toggle.count()) {
    // ensure drawer open
    if (!(await page.locator(".rf-base__actions, .rf-base__pop").count())) {
      await toggle.click();
    }
  }
  await page.waitForTimeout(200);
  await shot(page, `risk-force-building-train-menu${tag}`);

  const trainBtn = page.locator("button", { hasText: "Train unit" });
  if (await trainBtn.count()) {
    await trainBtn.first().click();
    await page.waitForTimeout(300);
  }
  await shot(page, `risk-force-train-unit-list${tag}`);
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
