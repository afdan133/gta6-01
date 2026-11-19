import { chromium } from '/home/agentuser/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = createServer(async (req, res) => {
  try {
    const p = join(ROOT, 'game', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    res.setHeader('content-type', MIME[extname(p)] ?? 'application/octet-stream');
    res.end(await readFile(p));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => srv.listen(8931, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8931/');
await page.waitForFunction(() => window.__city, { timeout: 15000 });
await sleep(2500);
await page.screenshot({ path: join(ROOT, 'screenshots', '01-title.jpg'), type: 'jpeg', quality: 85 });
// start the game
await page.keyboard.press('Enter');
await sleep(2000);
// walk a bit (WASD)
await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
await page.keyboard.down('KeyD'); await sleep(1500); await page.keyboard.up('KeyD');
await sleep(1000);
await page.screenshot({ path: join(ROOT, 'screenshots', '02-street.jpg'), type: 'jpeg', quality: 85 });
// enter nearest car: teleport player onto a traffic car then press E (test hook)
await page.evaluate(() => {
  const g = window.__city;
  const car = g.traffic.cars.find(c => c.kind !== 'police') ?? g.traffic.cars[0];
  g.player.x = car.x; g.player.y = car.y;
});
await page.keyboard.press('KeyE');
await sleep(1500);
await page.keyboard.down('KeyW'); await sleep(4000);
// steer a little
await page.keyboard.down('KeyA'); await sleep(1200); await page.keyboard.up('KeyA');
await page.keyboard.up('KeyW'); await sleep(800);
await page.screenshot({ path: join(ROOT, 'screenshots', '03-drive.jpg'), type: 'jpeg', quality: 85 });
// raise wanted: shoot peds/cars to build real heat, then verify stars
for (let i = 0; i < 14; i++) {
  await page.mouse.move(880 + (i % 6) * 25, 300 + i * 12); await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(350);
}
await page.evaluate(() => { const g = window.__city; g.player.wantedHeat = Math.max(g.player.wantedHeat ?? 0, 85); });
await sleep(9000);
await page.screenshot({ path: join(ROOT, 'screenshots', '04-chase.jpg'), type: 'jpeg', quality: 85 });
console.log('stars', await page.evaluate(() => Math.ceil((window.__city.player.wantedHeat ?? 0) / 20)), 'cops', await page.evaluate(() => window.__city.police.cops.length));
await browser.close(); srv.close();
console.log('CAPTURE OK');
