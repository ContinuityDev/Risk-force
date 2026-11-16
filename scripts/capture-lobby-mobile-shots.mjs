#!/usr/bin/env node
/**
 * 844×390 Solo Campaign lobby proof shots.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force/";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-lobby";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  copyFileSync(path, join(OUT, `followup_${name}.png`));
  console.log("saved", name);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /New Campaign/i }).click();
await page.waitForSelector('[data-testid="lobby-screen"]');
await page.waitForTimeout(250);

await shot(page, "lobby-mobile-844-top");

await page.evaluate(() => {
  const body = document.querySelector(".rf-lobby__body");
  if (body) body.scrollTop = body.scrollHeight;
});
await page.waitForTimeout(200);
await shot(page, "lobby-mobile-844-bottom");

await page.evaluate(() => {
  const body = document.querySelector(".rf-lobby__body");
  if (body) body.scrollTop = 0;
});
await page.waitForTimeout(120);
await page.getByRole("radio", { name: /^Hard$/i }).tap();
await page.waitForTimeout(150);
await shot(page, "lobby-mobile-844-menu-open");

await page.getByTestId("lobby-start").tap();
await page.waitForSelector(".rf-map", { timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(() => {
  try {
    window.__RF__?.dispatch({ type: "DISMISS_MESSAGE" });
  } catch {
    /* */
  }
});
await page.waitForTimeout(200);
await shot(page, "lobby-mobile-844-game-started");

await browser.close();
console.log("done");
