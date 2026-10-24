// Inline fonts + images into a single self-contained index.html, then (optionally)
// render owo-deck.pdf and per-slide PNGs with puppeteer-core + system Chrome.
//   node deck/build.mjs              -> deck/index.html
//   node deck/build.mjs --pdf        -> + web/public/owo-deck.pdf
//   node deck/build.mjs --shots DIR  -> + DIR/slide-NN.png
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const dir = path.dirname(new URL(import.meta.url).pathname);
let html = fs.readFileSync(path.join(dir, 'src.html'), 'utf8');
html = html.replace('/*FONTS*/', fs.readFileSync(path.join(dir, 'assets/fonts.css'), 'utf8'));
html = html.replace(/src="assets\/([^"]+\.jpg)"/g, (_, f) => `src="data:image/jpeg;base64,${fs.readFileSync(path.join(dir, 'assets', f)).toString('base64')}"`);
const out = path.join(dir, 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024 / 1024).toFixed(2), 'MB');

const args = process.argv.slice(2);
if (!args.includes('--pdf') && !args.includes('--shots')) process.exit(0);
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || '/Users/mac/Documents/Hacks/tote/video/node_modules/puppeteer-core');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('file://' + out, { waitUntil: 'load' });
await page.addStyleTag({ content: '.hud{display:none!important}' });
await page.evaluate(() => document.fonts.ready);
const si = args.indexOf('--shots');
if (si >= 0) {
  const shotDir = args[si + 1];
  fs.mkdirSync(shotDir, { recursive: true });
  const n = await page.evaluate(() => window.__deck.count);
  for (let k = 0; k < n; k++) {
    await page.evaluate((k) => window.__deck.go(k), k);
    await page.screenshot({ path: path.join(shotDir, `slide-${String(k + 1).padStart(2, '0')}.png`) });
  }
  // overflow check: any element whose box escapes its slide
  const issues = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('.slide').forEach((s, k) => {
      window.__deck.go(k);
      const sr = s.getBoundingClientRect();
      s.querySelectorAll('*').forEach((el) => {
        if (el.closest('.glow') || el.classList.contains('glow') || el.closest('svg') && el.tagName !== 'svg') return;
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > sr.right + 1 || r.bottom > sr.bottom + 1)) res.push(`slide ${k + 1}: ${el.tagName}.${el.className && el.className.baseVal === undefined ? el.className : ''} overflows`);
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'visible' && el.children.length === 0) res.push(`slide ${k + 1}: text overflow in ${el.tagName}.${el.className}`);
      });
    });
    return res;
  });
  console.log(issues.length ? issues.join('\n') : 'no overflow found');
}
if (args.includes('--pdf')) {
  await page.emulateMediaType('print');
  const pdf = path.resolve(dir, '../web/public/owo-deck.pdf');
  await page.pdf({ path: pdf, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  console.log('wrote', pdf, (fs.statSync(pdf).size / 1024 / 1024).toFixed(2), 'MB');
}
await browser.close();
