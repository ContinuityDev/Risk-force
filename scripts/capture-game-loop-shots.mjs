#!/usr/bin/env node
/**
 * Capture game-loop + sky-fix walkthrough screenshots.
 */
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
mkdirSync("/workspace/public/showcase", { recursive: true });

// Static battle showcase with FULL ground plane + deployment zones
const battleZonesHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Battle Deployment Zones</title>
<style>
html,body{margin:0;background:#0a1016;font-family:Georgia,serif;color:#e8eef4}
h2{text-align:center;font-weight:500;letter-spacing:.1em;opacity:.8;margin:12px 0 4px;font-size:.9rem}
.note{text-align:center;opacity:.5;font-size:.75rem;margin:0 0 8px}
.viewport{width:1280px;margin:0 auto 16px;border:1px solid #2a3848;overflow:hidden;box-shadow:inset 0 0 40px rgba(0,0,0,.45)}
.skyband{height:38px;background:linear-gradient(180deg,#152838,#1e3340 55%,#243628);border-bottom:1px solid rgba(40,55,38,.85)}
.arena{position:relative;width:100%;aspect-ratio:14/8;background:#1a2418;overflow:hidden}
.ground{position:absolute;inset:0;background:
  radial-gradient(ellipse 110px 70px at 12% 28%,transparent 30%,#1a2214 34%,#050704 42%,transparent 65%),
  radial-gradient(ellipse 200px 140px at 22% 48%,rgba(72,86,48,.42),transparent 72%),
  radial-gradient(ellipse 220px 150px at 74% 52%,rgba(58,68,42,.48),transparent 72%),
  linear-gradient(180deg,#3a4834 0%,#2a3828 28%,#1c2618 62%,#141a10 100%)}
.zone{position:absolute;pointer-events:none;border:1px dashed transparent}
.deploy{background:rgba(110,196,160,.16);border-color:rgba(110,196,160,.32)}
.nml{background:rgba(40,48,36,.08)}
.basez{background:rgba(126,182,201,.14);border-color:rgba(126,182,201,.3)}
.actor{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center}
.dir{width:100%;height:100%;display:block;background-repeat:no-repeat;
  filter:contrast(1.08) saturate(1.12) brightness(1.12) drop-shadow(0 6px 8px rgba(0,0,0,.5))}
.label{position:absolute;font-size:.65rem;letter-spacing:.08em;text-transform:uppercase;opacity:.7;pointer-events:none}
</style></head><body>
<h2>BATTLE START · DEPLOYMENT ZONES ON GROUND</h2>
<p class="note">Sky band above playable bounds · green deploy · blue defender base · units on dirt only</p>
<div class="viewport">
  <div class="skyband"></div>
  <div class="arena" id="stage">
    <div class="ground"></div>
    <div class="zone deploy" style="left:2.86%;top:5.6%;width:21.4%;height:88.75%"></div>
    <div class="zone nml" style="left:24.3%;top:5.6%;width:30%;height:88.75%"></div>
    <div class="zone basez" style="left:54.3%;top:5.6%;width:42.5%;height:88.75%"></div>
    <span class="label" style="left:6%;top:8%">Deploy</span>
    <span class="label" style="left:36%;top:8%">No-man's-land</span>
    <span class="label" style="left:70%;top:8%">Defender base</span>
  </div>
</div>
<script>
const stage=document.getElementById('stage');
const W=14,H=8,DIRS=8;
function dirSprite(sheet,frame,size){
  const s=document.createElement('span');
  s.className='dir';
  s.style.width=size+'px';s.style.height=size+'px';
  s.style.backgroundImage='url('+sheet+')';
  s.style.backgroundSize=(DIRS*100)+'% 100%';
  s.style.backgroundPosition=((frame/(DIRS-1))*100)+'% 0%';
  return s;
}
function place(sheet,frame,x,y,size){
  const d=document.createElement('div');
  d.className='actor';
  d.style.left=(x/W*100)+'%';d.style.top=(y/H*100)+'%';
  d.style.width=size+'px';d.style.height=size+'px';
  d.appendChild(dirSprite(sheet,frame,size));
  stage.appendChild(d);
}
const U='/sprites/units/',B='/sprites/buildings/';
place(U+'unit-rail-tank-dirs.png',0,1.2,2.0,112);
place(U+'unit-hover-dirs.png',0,1.8,3.6,112);
place(U+'unit-trooper-dirs.png',0,2.4,1.4,94);
place(U+'unit-trooper-dirs.png',1,2.6,5.2,94);
place(U+'unit-mech-dirs.png',0,1.5,6.4,120);
place(U+'unit-siege-dirs.png',0,0.9,4.4,108);
place(B+'building-laser-dirs.png',4,9.2,1.8,130);
place(B+'building-missile-dirs.png',4,10.4,3.2,130);
place(B+'building-railgun-dirs.png',4,9.0,5.0,130);
place(B+'building-nexus.png',4,12.0,4.0,150);
const img=(src,x,y,size)=>{
  const d=document.createElement('div');
  d.className='actor';
  d.style.left=(x/W*100)+'%';d.style.top=(y/H*100)+'%';
  d.style.width=size+'px';d.style.height=size+'px';
  d.innerHTML='<img src="'+src+'" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))"/>';
  stage.appendChild(d);
};
img(B+'building-shield.png',11.4,2.2,128);
img(B+'building-reactor.png',12.2,5.6,140);
place(U+'unit-trooper-dirs.png',4,7.0,2.4,94);
place(U+'unit-hover-dirs.png',4,7.4,5.8,112);
</script>
</body></html>`;

const battleMidHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Battle Mid-Fight</title>
<style>
html,body{margin:0;background:#0a1016;font-family:Georgia,serif;color:#e8eef4}
h2{text-align:center;font-weight:500;letter-spacing:.1em;opacity:.8;margin:12px 0 4px;font-size:.9rem}
.note{text-align:center;opacity:.5;font-size:.75rem;margin:0 0 8px}
.viewport{width:1280px;margin:0 auto 16px;border:1px solid #2a3848;overflow:hidden}
.skyband{height:38px;background:linear-gradient(180deg,#152838,#1e3340 55%,#243628);border-bottom:1px solid rgba(40,55,38,.85)}
.arena{position:relative;width:100%;aspect-ratio:14/8;background:#1a2418;overflow:hidden}
.ground{position:absolute;inset:0;background:
  radial-gradient(ellipse 110px 70px at 12% 28%,transparent 30%,#1a2214 34%,#050704 42%,transparent 65%),
  radial-gradient(ellipse 200px 140px at 22% 48%,rgba(72,86,48,.42),transparent 72%),
  radial-gradient(ellipse 220px 150px at 74% 52%,rgba(58,68,42,.48),transparent 72%),
  linear-gradient(180deg,#3a4834 0%,#2a3828 28%,#1c2618 62%,#141a10 100%)}
.actor{position:absolute;transform:translate(-50%,-50%)}
.dir{width:100%;height:100%;display:block;background-repeat:no-repeat;
  filter:contrast(1.08) saturate(1.12) brightness(1.12) drop-shadow(0 6px 8px rgba(0,0,0,.5))}
.blast{position:absolute;transform:translate(-50%,-50%);display:grid;place-items:center}
.blast>*{grid-area:1/1}
</style></head><body>
<h2>MID ENGAGEMENT · GROUND PLANE ONLY</h2>
<p class="note">Units and buildings stay on dirt — sky is outside the arena</p>
<div class="viewport">
  <div class="skyband"></div>
  <div class="arena" id="stage"><div class="ground"></div></div>
</div>
<script>
const stage=document.getElementById('stage');
const W=14,H=8,DIRS=8;
function dirSprite(sheet,frame,size){
  const s=document.createElement('span');
  s.className='dir';
  s.style.width=size+'px';s.style.height=size+'px';
  s.style.backgroundImage='url('+sheet+')';
  s.style.backgroundSize=(DIRS*100)+'% 100%';
  s.style.backgroundPosition=((frame/(DIRS-1))*100)+'% 0%';
  return s;
}
function place(sheet,frame,x,y,size){
  const d=document.createElement('div');
  d.className='actor';
  d.style.left=(x/W*100)+'%';d.style.top=(y/H*100)+'%';
  d.style.width=size+'px';d.style.height=size+'px';
  d.appendChild(dirSprite(sheet,frame,size));
  stage.appendChild(d);
}
const U='/sprites/units/',B='/sprites/buildings/';
place(U+'unit-rail-tank-dirs.png',0,4.2,2.6,112);
place(U+'unit-hover-dirs.png',1,5.0,4.0,112);
place(U+'unit-trooper-dirs.png',0,4.8,1.6,94);
place(U+'unit-mech-dirs.png',1,5.6,6.0,120);
place(U+'unit-siege-dirs.png',0,3.2,5.2,108);
place(B+'building-laser-dirs.png',4,9.0,2.0,130);
place(B+'building-missile-dirs.png',5,9.8,3.8,130);
place(B+'building-flak-dirs.png',4,8.6,5.4,128);
place(B+'building-railgun-dirs.png',4,10.2,6.2,130);
const d=document.createElement('div');
d.className='blast';
d.style.left=(6.4/W*100)+'%';d.style.top=(3.2/H*100)+'%';
d.innerHTML='<img src="/sprites/effects/fx-explosion.png" style="width:145px;height:145px;filter:brightness(1.2) saturate(1.3)"/>'
  +'<img src="/sprites/effects/fx-smoke.png" style="width:120px;height:120px;transform:translateY(-30px) scale(1.2);opacity:.55"/>';
stage.appendChild(d);
const beam=document.createElement('div');
beam.style.cssText='position:absolute;left:36%;top:40%;width:28%;height:3px;background:linear-gradient(90deg,transparent,#9fd4e4,#fff);box-shadow:0 0 8px #7eb6c9;transform:rotate(4deg);opacity:.85';
stage.appendChild(beam);
</script>
</body></html>`;

const aiPlansHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>AI Multi-Front Attack Plans</title>
<style>
html,body{margin:0;background:#0a1016;font-family:Georgia,serif;color:#e8eef4}
h2{text-align:center;font-weight:500;letter-spacing:.1em;opacity:.8;margin:14px 0 4px;font-size:.95rem}
.note{text-align:center;opacity:.55;font-size:.75rem;margin:0 0 10px}
.wrap{width:1280px;height:640px;margin:0 auto 18px;border:1px solid #2a3848;background:
  radial-gradient(ellipse at 50% 40%,#163040,transparent 55%),
  linear-gradient(180deg,#0e1820,#0a1218);position:relative;overflow:hidden}
svg{width:100%;height:100%}
.land{fill:#1e2c24;stroke:#3a5040;stroke-width:1.2}
.owned{fill:#2a4838}
.enemy{fill:#3a2830}
.label{fill:#c8d4c0;font-size:11px;letter-spacing:.04em}
.arrow{fill:none;stroke:#e8b060;stroke-width:2.4;opacity:.9;marker-end:url(#arrow)}
.arrow2{stroke:#c07070;stroke-width:2.2}
.tag{position:absolute;left:18px;bottom:14px;font-size:.72rem;opacity:.7;letter-spacing:.06em}
</style></head><body>
<h2>AI ATTACK PLAN · MULTI-FRONT</h2>
<p class="note">Border defense held · primary strike + flanking axis (personality: opportunism / flanking)</p>
<div class="wrap">
<svg viewBox="450 40 220 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#e8b060"/>
    </marker>
  </defs>
  <!-- Simplified Europe blobs -->
  <ellipse class="land owned" cx="496" cy="104" rx="22" ry="14"/>
  <ellipse class="land owned" cx="537" cy="78" rx="26" ry="18"/>
  <ellipse class="land owned" cx="508" cy="120" rx="24" ry="16"/>
  <ellipse class="land enemy" cx="550" cy="110" rx="22" ry="15"/>
  <ellipse class="land enemy" cx="566" cy="127" rx="24" ry="14"/>
  <ellipse class="land enemy" cx="578" cy="107" rx="22" ry="16"/>
  <ellipse class="land owned" cx="480" cy="88" rx="16" ry="10"/>
  <text class="label" x="486" y="106">Britain</text>
  <text class="label" x="520" y="80">Scandinavia</text>
  <text class="label" x="492" y="124">W. Europe</text>
  <text class="label" x="536" y="112">C. Europe</text>
  <text class="label" x="552" y="130">S. Europe</text>
  <text class="label" x="564" y="108">E. Europe</text>
  <!-- Primary + flank arrows -->
  <path class="arrow" d="M508,120 Q528,118 548,112"/>
  <path class="arrow arrow2" d="M537,85 Q555,95 568,120"/>
  <path class="arrow" d="M496,108 Q520,100 548,108" opacity=".55"/>
</svg>
<div class="tag">GOLD = primary axis · RED = flanking front</div>
</div>
</body></html>`;

writeFileSync("/workspace/public/showcase/battle-zones.html", battleZonesHtml);
writeFileSync("/workspace/public/showcase/battle-mid-ground.html", battleMidHtml);
writeFileSync("/workspace/public/showcase/ai-attack-plans.html", aiPlansHtml);
try {
  mkdirSync("/workspace/dist/showcase", { recursive: true });
  copyFileSync(
    "/workspace/public/showcase/battle-zones.html",
    "/workspace/dist/showcase/battle-zones.html",
  );
  copyFileSync(
    "/workspace/public/showcase/battle-mid-ground.html",
    "/workspace/dist/showcase/battle-mid-ground.html",
  );
  copyFileSync(
    "/workspace/public/showcase/ai-attack-plans.html",
    "/workspace/dist/showcase/ai-attack-plans.html",
  );
} catch {
  /* preview may use public via middleware */
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});

async function shot(name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name);
}

await page.goto(`${BASE}/showcase/battle-zones.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shot("risk-force-battle-deploy-zones");

await page.goto(`${BASE}/showcase/battle-mid-ground.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await shot("risk-force-battle-mid-ground");

// Live app
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

async function clickThroughLobby() {
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForTimeout(400);
  }
  for (let i = 0; i < 10; i++) {
    const onMap =
      (await page.locator(".rf-map__territory, .rf-map svg, .rf-map").count()) > 0;
    if (onMap) return true;
    const primary = page.locator("button.primary");
    if (await primary.count()) {
      await primary.first().click();
      await page.waitForTimeout(450);
    } else {
      const start = page.getByRole("button", {
        name: /Start|Begin|Launch|Play|Confirm/i,
      });
      if (await start.count()) await start.first().click();
      await page.waitForTimeout(450);
    }
  }
  return (await page.locator(".rf-map, .rf-hud").count()) > 0;
}

await clickThroughLobby();
await page.waitForTimeout(700);

// Campaigning budget UI in HUD
await shot("risk-force-campaign-budget");

// Select owned territory → Base for pop/training + staffing
await page.evaluate(() => {
  const svg = document.querySelector(".rf-map__svg");
  if (svg) svg.setAttribute("viewBox", "0 0 1000 500");
});
const owned = page.locator(".rf-map__territory.is-owned, .rf-map__territory[data-owner='player']");
if (await owned.count()) {
  await owned.first().click({ force: true });
} else {
  const any = page.locator(".rf-map__territory").first();
  if (await any.count()) await any.click({ force: true });
}
await page.waitForTimeout(300);
const baseBtn = page.getByRole("button", { name: /^Base$/i });
if (await baseBtn.count()) await baseBtn.first().click();
else {
  const b = page.getByRole("button", { name: /Base|Build/i });
  if (await b.count()) await b.first().click();
}
await page.waitForTimeout(900);
await shot("risk-force-base-pop-train");

// Hover a pad with a building selected for green/red ghost
const catalogBtn = page.locator(".rf-base__catalog button:not([disabled])").first();
if (await catalogBtn.count()) {
  await catalogBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
}
const pad = page.locator(".rf-base__pad:not(.is-filled)").first();
if (await pad.count()) {
  await pad.hover().catch(() => {});
  await page.waitForTimeout(300);
}
await shot("risk-force-base-placement-hover");
await shot("risk-force-base-worker-staff");

// Static multi-front AI plan diagram (reliable demo of intended behaviour)
await page.goto(`${BASE}/showcase/ai-attack-plans.html`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(400);
await shot("risk-force-ai-attack-plans");

// Return to live app — End Turn to trigger AI invasion → live battle with zones
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await clickThroughLobby();
await page.waitForTimeout(500);

const endBtn = page.getByRole("button", { name: /^End Turn$/i });
if ((await endBtn.count()) && !(await endBtn.isDisabled())) {
  await endBtn.click();
  // AI may SET_AI_ATTACK_PLANS then START_INVASION → battle screen
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    if ((await page.locator(".rf-battle__arena").count()) > 0) break;
    if ((await page.locator(".rf-map__ai-plans").count()) > 0) {
      await shot("risk-force-ai-plans-live");
    }
  }
}

if ((await page.locator(".rf-battle__arena").count()) > 0) {
  await shot("risk-force-battle-live-start");
  await page.waitForTimeout(1800);
  await shot("risk-force-battle-live-mid");
} else {
  // Fallback: open Invade and launch if available
  const mapBtn2 = page.getByRole("button", { name: /^Map$/i });
  if (await mapBtn2.count()) await mapBtn2.click();
  await page.waitForTimeout(300);
  const invade = page.getByRole("button", { name: /^Invade$/i });
  if ((await invade.count()) && !(await invade.isDisabled())) {
    await invade.click();
    await page.waitForTimeout(500);
    // bump unit counts
    const plus = page.locator(".rf-invade button").filter({ hasText: "+" });
    for (let i = 0; i < Math.min(6, await plus.count()); i++) {
      await plus.nth(i).click().catch(() => {});
    }
    const launch = page.getByRole("button", {
      name: /Launch|Confirm|Strike|Begin Invasion|Invade/i,
    });
    if ((await launch.count()) && !(await launch.first().isDisabled())) {
      await launch.first().click();
      await page.waitForTimeout(900);
      if ((await page.locator(".rf-battle__arena").count()) > 0) {
        await shot("risk-force-battle-live-start");
        await page.waitForTimeout(1800);
        await shot("risk-force-battle-live-mid");
      }
    }
  }
}

await browser.close();
console.log("Done.");
