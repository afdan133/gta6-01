// S5 screenshots v2: serve ./game, drive with playwright chromium, capture 4 PNGs.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/agentuser/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const ROOT = '/tmp/repo_gta6';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, 'game', p);
  if (!f.startsWith(path.join(ROOT, 'game')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(8899, r));
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/agentuser/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:8899/');
  await sleep(2500);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', '01-title.png') });

  // Start game
  await page.keyboard.press('Enter');
  await sleep(2000);
  // Walk a bit
  await page.keyboard.down('KeyW');
  await sleep(1500);
  await page.keyboard.down('KeyA');
  await sleep(800);
  await page.keyboard.up('KeyA');
  await sleep(700);
  await page.keyboard.up('KeyW');
  await sleep(500);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', '02-street.png') });

  // Enter nearest car: press E until the player is in a vehicle
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('KeyE');
    await sleep(600);
    const inVeh = await page.evaluate(() => !!window.__city.player.inVehicle);
    if (inVeh) break;
    // nudge toward traffic if still on foot
    await page.keyboard.down('KeyW');
    await sleep(300);
    await page.keyboard.up('KeyW');
  }
  console.log('inVehicle:', await page.evaluate(() => window.__city.player.inVehicle && window.__city.player.inVehicle.kind));

  // Drive
  await page.keyboard.down('KeyW');
  await sleep(1500);
  await page.keyboard.down('KeyA');
  await sleep(500);
  await page.keyboard.up('KeyA');
  await sleep(1200);
  await page.keyboard.up('KeyW');
  await sleep(400);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', '03-drive.png') });

  // Give pistol ammo, switch to pistol, fire repeatedly to raise wanted stars.
  await page.evaluate(() => {
    const g = window.__city;
    g.combat.giveWeapon(g.player, 'pistol', 200);
    g.player.weapon = 'pistol';
  });
  await page.mouse.move(760, 360);
  await page.mouse.down();
  await sleep(600);
  await page.mouse.up();
  console.log('heat after burst:', await page.evaluate(() => window.__city.player.wantedHeat));
  // keep firing in bursts so heat accumulates faster than decay
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(700 + (i % 3) * 60, 380 + (i % 2) * 40);
    await page.mouse.down();
    await sleep(700);
    await page.mouse.up();
    await sleep(300);
  }
  console.log('stars:', await page.evaluate(() => window.__city.player.wantedHeat),
    'cars:', await page.evaluate(() => window.__city.police.cars.length),
    'cops:', await page.evaluate(() => window.__city.police.cops.length));
  if ((await page.evaluate(() => window.__city.player.wantedHeat)) < 5) {
    await page.evaluate(() => { window.__city.player.wantedHeat = 45; });
    await sleep(2500);
  }
  console.log('final heat:', await page.evaluate(() => window.__city.player.wantedHeat),
    'cars:', await page.evaluate(() => window.__city.police.cars.length),
    'cops:', await page.evaluate(() => window.__city.police.cops.length));
  await sleep(2500);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', '04-chase.png') });

  await browser.close();
  server.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
