// press/make-media.mjs — rigenera i materiali per il README e il presskit.
//
//   npm run serve            (in un altro terminale)
//   node press/make-media.mjs
//
// Produce la GIF dell'ombra dell'ombra e l'immagine di anteprima Open Graph.
// L'encoder GIF89a è scritto qui a mano: il gioco non ha dipendenze, e non le
// prende nemmeno per farsi la vetrina.
//
// Serve Playwright: npm i -D @playwright/test && npx playwright install chromium
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = new URL('screenshots/ombra-dell-ombra.gif', import.meta.url).pathname;
const OG = new URL('screenshots/og.png', import.meta.url).pathname;
const BASE = process.env.BASE_URL || 'http://localhost:8080';
const W = 320;
const N = 30;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'it-IT' });
await page.goto(`${BASE}/index.html?fast=1`);
await page.waitForFunction(() => !!window.__fp && window.__fp.renderer.state.frames > 3, null, { timeout: 30000 });
await page.evaluate(() => {
  const fp = window.__fp;
  fp.settings.wiggle = false;
  fp.settings.gyro = true;
  fp.controls.state.gyroActive = true;
  fp.controls.state.beta0 = 0;
  fp.world.autoSpin = { xw: 0, zw: 0, xy: 0 };
  document.getElementById('hud').style.display = 'none';
});

const frames = [];
let H = 0;
for (let k = 0; k < N; k++) {
  const a = (2 * Math.PI * k) / N + 0.14; // il primo fotogramma è quasi frontale: il cubo dentro il cubo si legge subito
  await page.evaluate((a) => {
    const fp = window.__fp;
    const obj = fp.world.objects.find((o) => o.role === 'polytope');
    const b = a * 0.6;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const Rxw = [ca, 0, 0, -sa, 0, 1, 0, 0, 0, 0, 1, 0, sa, 0, 0, ca];
    const Rzw = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, cb, -sb, 0, 0, sb, cb];
    const m = new Float64Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let i = 0; i < 4; i++) s += Rxw[r * 4 + i] * Rzw[i * 4 + c]; m[r * 4 + c] = s; }
    obj.transform.rotation = m;
    fp.controls.state.gamma = 9 * Math.sin(a);
    fp.controls.state.beta = 5 * Math.cos(a);
  }, a);
  await page.waitForTimeout(340);
  const f = await page.evaluate((w) => {
    const src = document.getElementById('view');
    // ritaglio: l'oggetto e la sua ombra, niente interfaccia
    const sx = src.width * 0.04, sy = src.height * 0.22, sw = src.width * 0.92, sh = src.height * 0.54;
    const h = Math.round((w * sh) / sw);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let bin = '';
    for (let i = 0; i < d.length; i += 4) bin += String.fromCharCode(d[i], d[i + 1], d[i + 2]);
    return { h, data: btoa(bin) };
  }, W);
  H = f.h;
  frames.push(Buffer.from(f.data, 'base64'));
  process.stdout.write('.');
}

// l'immagine di anteprima: la maggior parte delle visite arriva da una chat
const wide = await browser.newPage({ viewport: { width: 1200, height: 630 }, locale: 'it-IT' });
await wide.goto(`${BASE}/index.html?fast=1`);
await wide.waitForFunction(() => !!window.__fp && window.__fp.renderer.state.frames > 3, null, { timeout: 30000 });
await wide.evaluate(() => {
  window.__fp.settings.wiggle = false;
  window.__fp.world.autoSpin = { xw: 0.34, zw: 0.21, xy: 0 };
  // su uno schermo largo l'oggetto è fisicamente piccolo: per l'anteprima lo si
  // avvicina, perché quell'immagine deve funzionare dentro una chat
  window.__fp.world.view.scale3 = 0.155;
  window.__fp.world.view.offset3 = [0, 0.03, -0.30];
  window.__fp.world.view.floorY = -0.16;
  window.__fp.world.view.shadowRadius = 0.42;
  document.getElementById('hud').style.display = 'none';
});
await wide.waitForTimeout(1400);
await wide.screenshot({ path: OG, timeout: 60000 });

await browser.close();
console.log('\nfotogrammi:', frames.length, W + 'x' + H);

// ------------------------------------------------------------- quantizzazione
function medianCut(pixels, depth) {
  if (depth === 0 || pixels.length === 0) {
    const c = [0, 0, 0];
    for (const p of pixels) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    const n = Math.max(1, pixels.length);
    return [[Math.round(c[0] / n), Math.round(c[1] / n), Math.round(c[2] / n)]];
  }
  let ch = 0, best = -1;
  for (let k = 0; k < 3; k++) {
    let lo = 255, hi = 0;
    for (const p of pixels) { if (p[k] < lo) lo = p[k]; if (p[k] > hi) hi = p[k]; }
    if (hi - lo > best) { best = hi - lo; ch = k; }
  }
  pixels.sort((a, b) => a[ch] - b[ch]);
  const mid = pixels.length >> 1;
  return [...medianCut(pixels.slice(0, mid), depth - 1), ...medianCut(pixels.slice(mid), depth - 1)];
}

const sample = [];
for (const f of frames) {
  for (let i = 0; i < f.length; i += 3 * 7) sample.push([f[i], f[i + 1], f[i + 2]]);
}
const palette = medianCut(sample, 7); // 128 colori
while (palette.length < 128) palette.push([0, 0, 0]);

const cache = new Map();
function indexOfColor(r, g, b) {
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let v = cache.get(key);
  if (v !== undefined) return v;
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
    const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  cache.set(key, bestI);
  return bestI;
}

// --------------------------------------------------------------- encoder GIF
class BitWriter {
  constructor() { this.bytes = []; this.acc = 0; this.n = 0; }
  write(code, len) {
    this.acc |= code << this.n;
    this.n += len;
    while (this.n >= 8) { this.bytes.push(this.acc & 0xff); this.acc >>= 8; this.n -= 8; }
  }
  flush() { if (this.n > 0) { this.bytes.push(this.acc & 0xff); this.acc = 0; this.n = 0; } }
}

function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map();
  const bw = new BitWriter();
  bw.write(clear, codeSize);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    if (dict.has(key)) { prefix = dict.get(key); continue; }
    bw.write(prefix, codeSize);
    dict.set(key, next);
    next++;
    if (next > (1 << codeSize)) {
      codeSize++;
      if (codeSize > 12) {
        bw.write(clear, 12);
        dict = new Map();
        next = eoi + 1;
        codeSize = minCodeSize + 1;
      }
    }
    prefix = k;
  }
  bw.write(prefix, codeSize);
  bw.write(eoi, codeSize);
  bw.flush();
  return bw.bytes;
}

const out = [];
const push = (...b) => out.push(...b);
const short = (v) => push(v & 0xff, (v >> 8) & 0xff);

push(...Buffer.from('GIF89a'));
short(W); short(H);
push(0xf6, 0, 0); // tabella colori globale, 128 voci
for (const c of palette) push(c[0], c[1], c[2]);
// ciclo infinito
push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0x00, 0x00, 0x00);

for (const f of frames) {
  const idx = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < idx.length; i++, p += 3) idx[i] = indexOfColor(f[p], f[p + 1], f[p + 2]);
  push(0x21, 0xf9, 0x04, 0x04); short(8); push(0x00, 0x00); // 80 ms
  push(0x2c); short(0); short(0); short(W); short(H); push(0x00);
  push(7);
  const data = lzw(idx, 7);
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    push(chunk.length, ...chunk);
  }
  push(0x00);
}
push(0x3b);

fs.writeFileSync(OUT, Buffer.from(out));
console.log('scritta', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
