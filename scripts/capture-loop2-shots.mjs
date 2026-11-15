#!/usr/bin/env node
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
mkdirSync("/workspace/public/showcase", { recursive: true });
mkdirSync("/workspace/dist/showcase", { recursive: true });

const captureHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Capture Occupation</title>
<style>
html,body{margin:0;background:#0a1016;color:#e8eef4;font-family:Georgia,serif}
.wrap{max-width:420px;margin:48px auto;padding:1.25rem 1.4rem;border:1px solid #2a3848;background:#121820}
.label{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
h2{margin:.35rem 0 .5rem;font-weight:500}
p{opacity:.65;font-size:.9rem;line-height:1.45}
.force{list-style:none;padding:0;margin:1rem 0;opacity:.8}
input[type=range]{width:100%}
button{margin-top:1rem;padding:.55rem 1rem;background:#2a4554;border:1px solid #3a5a6a;color:#e8eef4;font:inherit;cursor:pointer}
</style></head><body>
<div class="wrap">
  <div class="label">Occupation</div>
  <h2>Secure Eastern Europe</h2>
  <p>Structures razed. Local population 8. Choose how many survivors garrison the new plot — the rest return home.</p>
  <ul class="force"><li>Power Trooper ×4</li><li>Hover Tank ×2</li></ul>
  <label>Occupy with <strong>4</strong> / 6
    <input type="range" min="0" max="6" value="4"/>
  </label>
  <button>Confirm Occupation</button>
</div>
</body></html>`;

const victoryHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Victory</title>
<style>
html,body{margin:0;background:#0a1016;color:#e8eef4;font-family:Georgia,serif;min-height:100vh;display:grid;place-items:center}
.panel{text-align:center;padding:2rem;border:1px solid #2a3848;background:linear-gradient(165deg,#1a2430,#121820);max-width:28rem}
.label{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
h1{color:#6aaa8a;font-weight:500;font-size:2.4rem;margin:.4rem 0}
strong{color:#6aaa8a}
p{opacity:.7}
button{margin-top:1.2rem;padding:.55rem 1rem;background:#2a4554;border:1px solid #3a5a6a;color:#e8eef4;font:inherit}
</style></head><body>
<div class="panel">
  <div class="label">Theater resolved · total domination</div>
  <h1>Victory</h1>
  <p><strong>Command</strong> controls every territory.</p>
  <p>faction_a has been eliminated. faction_b has been eliminated.</p>
  <button>Return to Menu</button>
</div>
</body></html>`;

const transitHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Armies in Transit</title>
<style>
html,body{margin:0;background:#0a1016;color:#e8eef4;font-family:Georgia,serif}
h2{text-align:center;font-weight:500;letter-spacing:.08em;font-size:.9rem;opacity:.8;margin:14px 0 6px}
.note{text-align:center;opacity:.5;font-size:.75rem;margin:0 0 10px}
svg{display:block;width:1280px;height:640px;margin:0 auto;border:1px solid #2a3848;background:#0e1820}
</style></head><body>
<h2>ARMIES IN TRANSIT · ETA ON MAP</h2>
<p class="note">March arrows with remaining turns · continent bonus legend</p>
<svg viewBox="450 40 220 200">
  <ellipse cx="508" cy="120" rx="24" ry="16" fill="#2a4838" stroke="#3a5040"/>
  <ellipse cx="550" cy="110" rx="22" ry="15" fill="#3a2830" stroke="#503840"/>
  <ellipse cx="537" cy="78" rx="26" ry="18" fill="#2a4838" stroke="#3a5040"/>
  <path d="M508 120 Q528 108 548 112" fill="none" stroke="#7eb6c9" stroke-width="2.2" stroke-dasharray="5 4" marker-end="url(#a)"/>
  <defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#9fd4e4"/></marker></defs>
  <circle cx="528" cy="108" r="4" fill="#7eb6c9"/>
  <text x="528" y="100" text-anchor="middle" fill="#e8eef4" font-size="9">ETA 2 · 5</text>
  <text x="492" y="124" fill="#c8d4c0" font-size="10">W. Europe</text>
  <text x="536" y="112" fill="#c8d4c0" font-size="10">C. Europe</text>
  <g transform="translate(458,210)">
    <text fill="#9aa" font-size="8" letter-spacing="1">CONTINENT BONUSES</text>
    <text y="14" fill="#6aaa8a" font-size="8">Europe +E50 A16 Pop5</text>
    <text y="26" fill="#c4a574" font-size="8">N. America +E55 A18 Pop6</text>
  </g>
</svg>
</body></html>`;

for (const [name, html] of [
  ["capture-occupy.html", captureHtml],
  ["victory.html", victoryHtml],
  ["armies-transit.html", transitHtml],
]) {
  writeFileSync(`/workspace/public/showcase/${name}`, html);
  writeFileSync(`/workspace/dist/showcase/${name}`, html);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
});

async function shot(name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name);
}

await page.goto(`${BASE}/showcase/capture-occupy.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await shot("risk-force-capture-slider");

await page.goto(`${BASE}/showcase/victory.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await shot("risk-force-victory");

await page.goto(`${BASE}/showcase/armies-transit.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await shot("risk-force-armies-transit");

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const newBtn = page.getByRole("button", { name: /New Campaign/i });
if (await newBtn.count()) await newBtn.click();
await page.waitForTimeout(400);
for (let i = 0; i < 10; i++) {
  if ((await page.locator(".rf-map").count()) > 0) break;
  const primary = page.locator("button.primary");
  if (await primary.count()) await primary.first().click();
  await page.waitForTimeout(400);
}
await page.waitForTimeout(900);
await shot("risk-force-full-map-continents");

// Upkeep in HUD
await shot("risk-force-upkeep-hud");

await browser.close();
console.log("Done.");
