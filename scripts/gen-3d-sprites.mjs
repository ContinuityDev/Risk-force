#!/usr/bin/env node
/**
 * Pre-render procedural three.js models to PNG sprites via headless Chromium.
 * Run: npm run gen-sprites
 */
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAB = join(ROOT, "scripts/sprite-lab");
const OUT = join(ROOT, "public/sprites");
const BUNDLE = join(LAB, "bundle.js");

console.log("Bundling sprite lab…");
execSync(
  `npx esbuild ${join(LAB, "render-entry.js")} --bundle --format=iife --outfile=${BUNDLE} --platform=browser`,
  { stdio: "inherit", cwd: ROOT },
);

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Sprite Lab</title>
<style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style>
</head><body>
<script src="/bundle.js"></script>
</body></html>`;
writeFileSync(join(LAB, "index.html"), html);

const MIME = {
  ".js": "application/javascript",
  ".html": "text/html",
  ".mjs": "application/javascript",
};

const server = createServer((req, res) => {
  const url = req.url?.split("?")[0] ?? "/";
  let file = url === "/" ? "/index.html" : url;
  const abs = join(LAB, file.replace(/^\//, ""));
  if (!abs.startsWith(LAB) || !existsSync(abs)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(abs)] ?? "text/plain" });
  res.end(readFileSync(abs));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
console.log(`Sprite lab at ${base}`);

function saveDataUrl(dataUrl, relPath) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const abs = join(OUT, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, Buffer.from(b64, "base64"));
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 256, height: 256 },
  deviceScaleFactor: 1,
});

page.on("pageerror", (err) => console.error("PAGE ERROR", err));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("CONSOLE", msg.text());
});

await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.SpriteLab?.listRecipes, {
  timeout: 30000,
});

const catalog = await page.evaluate(() => window.SpriteLab.listRecipes());
let count = 0;

async function bakeList(items, category) {
  for (const item of items) {
    const idle = await page.evaluate(
      ({ id, category }) => window.SpriteLab.renderOne(id, category, "idle"),
      { id: item.id, category },
    );
    saveDataUrl(idle.dataUrl, idle.file);
    count++;

    const frames = await page.evaluate(
      ({ id, category }) => window.SpriteLab.renderAllFrames(id, category),
      { id: item.id, category },
    );
    const sheetUrl = await page.evaluate(async (frameUrls) => {
      const w = 256;
      const h = 256;
      const canvas = document.createElement("canvas");
      canvas.width = w * frameUrls.length;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      for (let i = 0; i < frameUrls.length; i++) {
        const img = new Image();
        img.src = frameUrls[i].dataUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        ctx.drawImage(img, i * w, 0);
      }
      return canvas.toDataURL("image/png");
    }, frames);
    const sheetFile = item.file.replace(/\.png$/, "-sheet.png");
    saveDataUrl(sheetUrl, sheetFile);
    count++;
    console.log("baked", item.id);
  }
}

await bakeList(catalog.units, "units");
await bakeList(catalog.buildings, "buildings");
await bakeList(catalog.fx, "fx");

await browser.close();
server.close();
console.log(`Done — ${count} PNG assets written to public/sprites`);
