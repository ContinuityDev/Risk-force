#!/usr/bin/env node
/**
 * Capture Risk Force walkthrough screenshots via Playwright.
 */
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:5173";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const battleHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Battle Mid</title>
<style>
html,body{margin:0;background:#0a1016;font-family:system-ui,sans-serif;color:#e8eef4}
.stage{position:relative;width:1280px;height:720px;margin:16px auto;border:1px solid #2a3848;overflow:hidden;background:#0e1820}
.sky{position:absolute;inset:0 0 45% 0;background:linear-gradient(180deg,#152838,#101c28)}
.ground{position:absolute;inset:36% 0 0 0;background:
  radial-gradient(ellipse 70px 28px at 16% 48%,#080a06 0 32%,transparent 70%),
  radial-gradient(ellipse 52px 22px at 38% 70%,#0a0e08 0 36%,transparent 72%),
  radial-gradient(ellipse 60px 24px at 62% 42%,#0c1008 0 30%,transparent 68%),
  radial-gradient(ellipse 40px 18px at 82% 64%,#10140c 0 38%,transparent 72%),
  linear-gradient(0deg,transparent 38%,rgba(36,42,30,.75) 40%,rgba(48,52,38,.55) 44%,transparent 48%),
  linear-gradient(185deg,#2a3428 0%,#1a2016 40%,#10140c 100%)}
.scorch{position:absolute;inset:36% 0 0 0;background:
  radial-gradient(ellipse 50px 18px at 22% 52%,rgba(20,12,8,.7) 0 40%,transparent 70%),
  radial-gradient(ellipse 36px 14px at 55% 38%,rgba(30,16,8,.55) 0 35%,transparent 65%);mix-blend-mode:multiply}
.smoke{position:absolute;width:120px;height:160px;background:radial-gradient(ellipse at 50% 70%,rgba(50,48,44,.45),transparent 65%);filter:blur(6px);opacity:.55}
.actor{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center}
.actor img{width:100%;height:100%;object-fit:contain;filter:contrast(1.06) saturate(1.08) drop-shadow(0 8px 10px rgba(0,0,0,.6))}
.blast{position:absolute;transform:translate(-50%,-50%);display:grid;place-items:center}
.blast>*{grid-area:1/1}
h2{text-align:center;font-weight:500;letter-spacing:.12em;opacity:.7;margin:12px 0 0;font-size:.9rem}
</style></head><body>
<h2>ENGAGEMENT · MID-ASSAULT</h2>
<div class="stage" id="stage">
  <div class="sky"></div>
  <div class="ground"></div>
  <div class="scorch"></div>
  <div class="smoke" style="left:18%;top:28%"></div>
  <div class="smoke" style="left:68%;top:22%;width:140px"></div>
</div>
<script>
const stage = document.getElementById('stage');
const W=14,H=7.2;
function place(src,x,y,size){
  const d=document.createElement('div');
  d.className='actor';
  d.style.left=(x/W*100)+'%';
  d.style.top=(y/H*100)+'%';
  d.style.width=size+'px';
  d.style.height=size+'px';
  d.innerHTML='<img src="'+src+'" alt=""/>';
  stage.appendChild(d);
}
const S='/sprites';
place(S+'/units/unit-trooper.png',1.6,1.2,94);
place(S+'/units/unit-trooper.png',2.9,1.5,94);
place(S+'/units/unit-power-trooper.png',1.9,2.2,96);
place(S+'/units/unit-rail-tank.png',1.0,2.6,112);
place(S+'/units/unit-hover.png',2.7,3.0,112);
place(S+'/units/unit-rail-tank.png',1.2,3.9,112);
place(S+'/units/unit-mech.png',1.1,4.5,120);
place(S+'/units/unit-siege-mech.png',2.8,4.9,120);
place(S+'/units/unit-howitzer.png',0.8,5.6,108);
place(S+'/units/unit-siege.png',2.4,5.9,108);
place(S+'/units/unit-gunship.png',2.2,0.7,100);
place(S+'/units/unit-drone.png',3.6,0.9,96);
place(S+'/buildings/building-laser.png',8.4,1.2,130);
place(S+'/buildings/building-flak.png',9.8,1.5,128);
place(S+'/buildings/building-missile.png',8.5,2.8,130);
place(S+'/buildings/building-plasma.png',9.9,3.2,128);
place(S+'/buildings/building-shield.png',10.4,1.8,128);
place(S+'/buildings/building-shield-gen.png',11.2,4.0,140);
place(S+'/buildings/building-reactor.png',11.8,2.0,130);
place(S+'/buildings/building-nexus.png',12.7,3.4,152);
place(S+'/buildings/building-railgun.png',8.6,4.6,130);
place(S+'/buildings/building-emp.png',9.9,5.2,128);
function blast(x,y,scale){
  const d=document.createElement('div');
  d.className='blast';
  d.style.left=(x/W*100)+'%';
  d.style.top=(y/H*100)+'%';
  d.innerHTML='<img src="'+S+'/effects/fx-explosion.png" style="width:148px;height:148px;transform:scale('+scale+');filter:drop-shadow(0 0 14px rgba(255,110,30,.55))"/>'
    +'<img src="'+S+'/effects/fx-smoke.png" style="width:160px;height:160px;transform:translateY(-20px) scale(1.4);opacity:.55;filter:blur(1px)"/>';
  stage.appendChild(d);
}
blast(6.2,2.4,1.6);
blast(7.1,4.8,1.9);
blast(5.5,5.2,1.3);
const beam=document.createElement('div');
beam.style.cssText='position:absolute;left:22%;top:38%;width:28%;height:3px;background:linear-gradient(90deg,#9fd4e4,#fff);box-shadow:0 0 8px #7eb6c9;transform:rotate(8deg);opacity:.85';
stage.appendChild(beam);
</script>
</body></html>`;

writeFileSync("/workspace/public/showcase/battle-mid.html", battleHtml);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});

async function shot(name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  const dest = join(OUT, `${name}.png`);
  copyFileSync(path, dest);
  console.log("saved", dest);
  return dest;
}

// Units close-up
await page.goto(`${BASE}/showcase/units.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await shot("risk-force-units-closeup");

// Battle mid (layout matching BattleView formations + new sprites/FX)
await page.setViewportSize({ width: 1360, height: 820 });
await page.goto(`${BASE}/showcase/battle-mid.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shot("risk-force-battle-mid");

// Live app — map + base
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const newBtn = page.getByRole("button", { name: /New Campaign/i });
if (await newBtn.count()) {
  await newBtn.click();
  await page.waitForTimeout(400);
}

// Lobby: click primary start
for (let i = 0; i < 6; i++) {
  const onMap =
    (await page.locator(".rf-map__territory, .rf-map svg, [class*='rf-map']").count()) > 0;
  if (onMap) break;
  const primary = page.locator("button.primary");
  if (await primary.count()) {
    await primary.first().click();
    await page.waitForTimeout(500);
  } else {
    const start = page.getByRole("button", { name: /Start|Begin|Launch|Play/i });
    if (await start.count()) await start.first().click();
    await page.waitForTimeout(500);
  }
}

await page.waitForTimeout(800);
await shot("risk-force-full-map");

// Base
const baseBtn = page.getByRole("button", { name: /^Base$/i });
if (await baseBtn.count()) {
  await baseBtn.first().click();
} else {
  const anyBase = page.getByRole("button", { name: /Base|Build/i });
  if (await anyBase.count()) await anyBase.first().click();
  else {
    const t = page.locator(".rf-map__territory").first();
    if (await t.count()) {
      await t.click({ force: true });
      await page.waitForTimeout(300);
      const b = page.getByRole("button", { name: /Base|Build/i });
      if (await b.count()) await b.first().click();
    }
  }
}
await page.waitForTimeout(900);
await shot("risk-force-base-view");

await browser.close();
console.log("Done.");
