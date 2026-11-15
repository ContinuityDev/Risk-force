#!/usr/bin/env node
/**
 * Capture Risk Force walkthrough screenshots via Playwright.
 * Required: battle facing, tank dirs sheet, base, buildings lineup, Europe zoom.
 */
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:5173";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
mkdirSync("/workspace/public/showcase", { recursive: true });

const battleHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Battle Facing</title>
<style>
html,body{margin:0;background:#0a1016;font-family:system-ui,sans-serif;color:#e8eef4}
.stage{position:relative;width:1280px;height:720px;margin:12px auto;border:1px solid #2a3848;overflow:hidden;background:#0e1820}
.sky{position:absolute;inset:0 0 45% 0;background:linear-gradient(180deg,#152838,#101c28)}
.horizon{position:absolute;left:0;right:0;top:48%;height:8%;background:linear-gradient(180deg,#243040,#1a2418)}
.ground{position:absolute;inset:52% 0 0 0;background:
  radial-gradient(ellipse 90px 36px at 14% 42%,transparent 28%,#1a2214 32%,#050704 40%,transparent 62%),
  radial-gradient(ellipse 70px 30px at 40% 68%,transparent 30%,#181e12 34%,#060806 42%,transparent 65%),
  radial-gradient(ellipse 160px 100px at 22% 50%,rgba(72,86,48,.4),transparent 70%),
  linear-gradient(185deg,#3a4834 0%,#243028 35%,#161c12 100%)}
.tracks{position:absolute;inset:52% 0 0 0;opacity:.45;background:repeating-linear-gradient(92deg,transparent 0 10px,rgba(30,28,22,.35) 10px 12px,transparent 12px 22px)}
.actor{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center}
.dir{width:100%;height:100%;display:block;background-repeat:no-repeat;filter:contrast(1.08) saturate(1.12) brightness(1.12) drop-shadow(0 6px 8px rgba(0,0,0,.5))}
.hp{position:absolute;left:28%;right:28%;top:4%;height:3px;background:rgba(8,12,16,.75);overflow:hidden}
.hp i{display:block;height:100%;background:#7eb6c9}
.blast{position:absolute;transform:translate(-50%,-50%);display:grid;place-items:center}
.blast>*{grid-area:1/1}
h2{text-align:center;font-weight:500;letter-spacing:.12em;opacity:.75;margin:10px 0 0;font-size:.85rem}
.note{text-align:center;opacity:.5;font-size:.75rem;margin:4px 0 0}
</style></head><body>
<h2>ENGAGEMENT · UNITS FACE TARGETS / MOVEMENT</h2>
<p class="note">8-direction sheets · attackers face east toward defenses · turrets track inbound</p>
<div class="stage" id="stage">
  <div class="sky"></div>
  <div class="horizon"></div>
  <div class="ground"></div>
  <div class="tracks"></div>
</div>
<script>
const stage=document.getElementById('stage');
const W=14,H=7.2,DIRS=8,CELL=256;
function dirSprite(sheet,frame,size){
  const s=document.createElement('span');
  s.className='dir';
  s.style.width=size+'px';
  s.style.height=size+'px';
  s.style.backgroundImage='url('+sheet+')';
  s.style.backgroundSize=(DIRS*100)+'% 100%';
  s.style.backgroundPosition=((frame/(DIRS-1))*100)+'% 0%';
  return s;
}
function place(sheet,frame,x,y,size,hp){
  const d=document.createElement('div');
  d.className='actor';
  d.style.left=(x/W*100)+'%';
  d.style.top=(y/H*100)+'%';
  d.style.width=size+'px';
  d.style.height=size+'px';
  d.appendChild(dirSprite(sheet,frame,size));
  if(hp!=null&&hp<1){
    const bar=document.createElement('span');
    bar.className='hp';
    bar.innerHTML='<i style="width:'+(hp*100)+'%"></i>';
    d.appendChild(bar);
  }
  stage.appendChild(d);
}
const U='/sprites/units/',B='/sprites/buildings/';
// Attackers advancing / aiming east & SE / NE toward base
place(U+'unit-rail-tank-dirs.png',0,1.4,2.4,112,0.7);
place(U+'unit-rail-tank-dirs.png',1,2.2,3.6,112,0.85);
place(U+'unit-hover-dirs.png',0,2.8,2.0,112);
place(U+'unit-hover-dirs.png',7,1.8,4.8,112,0.55);
place(U+'unit-mech-dirs.png',0,1.1,5.2,120);
place(U+'unit-siege-dirs.png',1,0.9,6.0,108,0.9);
place(U+'unit-trooper-dirs.png',0,3.0,1.4,94);
place(U+'unit-trooper-dirs.png',1,3.5,2.8,94);
place(U+'unit-gunship-dirs.png',0,2.4,0.8,100);
place(U+'unit-howitzer-dirs.png',0,0.7,3.2,108);
// Defenses facing west / SW / NW toward attackers
place(B+'building-laser-dirs.png',4,8.6,1.6,130,0.6);
place(B+'building-missile-dirs.png',5,9.8,2.6,130);
place(B+'building-flak-dirs.png',3,8.4,3.8,128,0.4);
place(B+'building-plasma-dirs.png',4,10.0,4.4,128);
place(B+'building-railgun-dirs.png',5,8.8,5.4,130,0.75);
place(B+'building-emp-dirs.png',4,10.2,5.8,128);
// Static unique buildings (single-facing)
const staticPlace=(src,x,y,size)=>{
  const d=document.createElement('div');
  d.className='actor';
  d.style.left=(x/W*100)+'%';d.style.top=(y/H*100)+'%';
  d.style.width=size+'px';d.style.height=size+'px';
  d.innerHTML='<img src="'+src+'" style="width:100%;height:100%;object-fit:contain;filter:contrast(1.08) saturate(1.12) brightness(1.12) drop-shadow(0 6px 8px rgba(0,0,0,.5))"/>';
  stage.appendChild(d);
};
staticPlace(B+'building-shield.png',11.2,1.9,128);
staticPlace(B+'building-reactor.png',12.0,2.8,140);
staticPlace(B+'building-nexus.png',12.6,4.2,152);
staticPlace(B+'building-fabricator.png',11.4,5.6,130);
function blast(x,y,scale){
  const d=document.createElement('div');
  d.className='blast';
  d.style.left=(x/W*100)+'%';d.style.top=(y/H*100)+'%';
  d.innerHTML='<img src="/sprites/effects/fx-explosion.png" style="width:168px;height:168px;transform:scale('+scale+');filter:brightness(1.25) saturate(1.3) drop-shadow(0 0 10px rgba(255,120,40,.5))"/>'
    +'<img src="/sprites/effects/fx-smoke.png" style="width:180px;height:180px;transform:translateY(-24px) scale(1.35);opacity:.55;filter:blur(1.5px)"/>';
  stage.appendChild(d);
}
blast(6.0,2.6,1.5);
blast(7.2,4.6,1.8);
const beam=document.createElement('div');
beam.style.cssText='position:absolute;left:20%;top:36%;width:32%;height:3px;background:linear-gradient(90deg,transparent,#9fd4e4,#fff);box-shadow:0 0 8px #7eb6c9;transform:rotate(6deg);opacity:.85';
stage.appendChild(beam);
</script>
</body></html>`;

const tankDirsHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Rail Tank — 8 Directions</title>
<style>
html,body{margin:0;background:#0c1218;color:#e8eef4;font-family:Georgia,serif}
h1{font-weight:500;letter-spacing:.08em;font-size:1.25rem;margin:1.25rem 2rem .35rem}
p{margin:0 2rem 1.25rem;opacity:.65;font-size:.9rem}
.sheet{display:block;margin:0 auto 1.5rem;width:min(96vw,1280px);height:auto;image-rendering:auto;
  filter:drop-shadow(0 12px 18px rgba(0,0,0,.55));background:#141c24;border:1px solid #2a3848;padding:12px;box-sizing:border-box}
.grid{display:flex;flex-wrap:wrap;gap:1rem;padding:0 2rem 2.5rem;justify-content:center}
.cell{display:flex;flex-direction:column;align-items:center;gap:.35rem;width:140px}
.cell .dir{width:128px;height:128px;background-repeat:no-repeat;background-size:800% 100%;
  filter:contrast(1.08) saturate(1.12) brightness(1.12) drop-shadow(0 8px 10px rgba(0,0,0,.5))}
.cell span{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
</style></head><body>
<h1>RAIL TANK — 8-DIRECTION BAKE</h1>
<p>Frame 0 = east (screen-right) · clockwise through SE · S · SW · W · NW · N · NE</p>
<img class="sheet" src="/sprites/units/unit-rail-tank-dirs.png" alt="Rail tank direction strip"/>
<div class="grid" id="grid"></div>
<script>
const labels=['E','SE','S','SW','W','NW','N','NE'];
const g=document.getElementById('grid');
for(let i=0;i<8;i++){
  const c=document.createElement('div');
  c.className='cell';
  const s=document.createElement('span');
  s.className='dir';
  s.style.backgroundImage='url(/sprites/units/unit-rail-tank-dirs.png)';
  s.style.backgroundPosition=((i/7)*100)+'% 0%';
  c.appendChild(s);
  const lab=document.createElement('span');
  lab.textContent='Dir '+i+' · '+labels[i];
  c.appendChild(lab);
  g.appendChild(c);
}
</script>
</body></html>`;

const buildingsHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Buildings Lineup</title>
<style>
html,body{margin:0;background:#0c1218;color:#e8eef4;font-family:Georgia,serif}
h1{font-weight:500;letter-spacing:.08em;font-size:1.25rem;margin:1.25rem 2rem .35rem}
p{margin:0 2rem 1rem;opacity:.65;font-size:.9rem}
.row{display:flex;flex-wrap:wrap;gap:1.1rem;padding:0.5rem 1.5rem 2.5rem;align-items:flex-end;justify-content:center}
.card{display:flex;flex-direction:column;align-items:center;gap:.35rem;width:148px}
.card img{width:132px;height:132px;object-fit:contain;filter:drop-shadow(0 10px 14px rgba(0,0,0,.55))}
.card span{font-size:.68rem;letter-spacing:.05em;text-transform:uppercase;opacity:.8;text-align:center}
</style></head><body>
<h1>STRUCTURES — UNIQUE SILHOUETTES</h1>
<p>Fusion reactor · refinery · fabricator · depot · shield pylon · laser · missile · nexus · geothermal · orbital · dark matter</p>
<div class="row" id="row"></div>
<script>
const items=[
  ['building-reactor','Fusion Reactor'],
  ['building-refinery','Alloy Refinery'],
  ['building-fabricator','Nano Fabricator'],
  ['building-supply','Supply Depot'],
  ['building-shield','Shield Pylon'],
  ['building-laser','Laser Turret'],
  ['building-missile','Missile Battery'],
  ['building-nexus','Command Nexus'],
  ['building-geothermal','Geothermal Plant'],
  ['building-orbital-collector','Orbital Collector'],
  ['building-dark-matter','Dark Matter Tap'],
  ['building-silo','Silo Pad'],
];
const row=document.getElementById('row');
for(const [id,name] of items){
  const d=document.createElement('div');
  d.className='card';
  d.innerHTML='<img src="/sprites/buildings/'+id+'.png" alt="'+name+'"/><span>'+name+'</span>';
  row.appendChild(d);
}
</script>
</body></html>`;

writeFileSync("/workspace/public/showcase/battle-mid.html", battleHtml);
writeFileSync("/workspace/public/showcase/tank-dirs.html", tankDirsHtml);
writeFileSync("/workspace/public/showcase/buildings.html", buildingsHtml);

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

await page.setViewportSize({ width: 1360, height: 820 });
await page.goto(`${BASE}/showcase/battle-mid.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await shot("risk-force-battle-facing");

await page.setViewportSize({ width: 1400, height: 900 });
await page.goto(`${BASE}/showcase/tank-dirs.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await shot("risk-force-tank-dirs");

await page.goto(`${BASE}/showcase/buildings.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await shot("risk-force-buildings-lineup");

// Live app — map + Europe zoom + base
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const newBtn = page.getByRole("button", { name: /New Campaign/i });
if (await newBtn.count()) {
  await newBtn.click();
  await page.waitForTimeout(400);
}

for (let i = 0; i < 8; i++) {
  const onMap =
    (await page.locator(".rf-map__territory, .rf-map svg").count()) > 0;
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

// Europe zoom via SVG viewBox
await page.evaluate(() => {
  const svg = document.querySelector(".rf-map__svg");
  if (svg) svg.setAttribute("viewBox", "450 20 220 200");
});
await page.waitForTimeout(400);
await shot("risk-force-europe-zoom");

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
      // Reset viewBox so click works
      await page.evaluate(() => {
        const svg = document.querySelector(".rf-map__svg");
        if (svg) svg.setAttribute("viewBox", "0 0 1000 500");
      });
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
