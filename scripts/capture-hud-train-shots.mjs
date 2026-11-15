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
}

async function suite(page, tag) {
  await boot(page);

  // HUD icons + labels
  await shot(page, `risk-force-hud-resources${tag}`);

  // Open energy tooltip
  await page.locator(".rf-resource--energy").click();
  await page.waitForTimeout(200);
  await shot(page, `risk-force-hud-resource-tooltip${tag}`);
  await page.locator(".rf-resource--energy").click();

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

  // Unaffordable catalog cost via Build drawer (mobile) / inline catalog
  const toggle = page.locator(".rf-base__drawer-toggle");
  if (await toggle.count()) await toggle.click();
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const btn = [
      ...document.querySelectorAll(".rf-base__catalog li button"),
    ].find((b) => b.textContent?.includes("Vehicle Factory"));
    btn?.scrollIntoView({ block: "center" });
    btn?.click();
  });
  await page.waitForTimeout(250);
  await shot(page, `risk-force-unaffordable-cost${tag}`);

  // Close build drawer so the Barracks context menu is unobstructed
  const backdrop = page.locator(".rf-drawer__backdrop");
  if (await backdrop.count()) {
    await backdrop.click({ force: true });
    await page.waitForTimeout(200);
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }

  // Tap barracks → anchored context menu (Train / Staff / Info)
  await clickBarracks(page);
  await page.waitForTimeout(200);
  await shot(page, `risk-force-building-train-menu${tag}`);

  const trainBtn = page.locator(".rf-base__ctx button", {
    hasText: "Train unit",
  });
  await trainBtn.click();
  await page.waitForSelector(".rf-base__train-list", { timeout: 5000 });
  await page.waitForTimeout(250);
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
