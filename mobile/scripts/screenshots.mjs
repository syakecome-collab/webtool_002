// App Store 用のスクリーンショットを Web 書き出しから撮る。
// 事前に `npx expo export --platform web --output-dir dist-web` を実行しておくこと。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8321';
const OUT = 'assets/store';

/** 実際に配達員が使ったあとに近い見た目にするための下敷きデータ */
function sampleShifts() {
  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const rows = [
    [0, 'Uber Eats', 660, 1200, 60, 21, 13200, 900, 1100, 62, 'rain'],
    [1, 'Uber Eats', 660, 1140, 45, 17, 10400, 400, 900, 51, 'cloudy'],
    [2, '出前館', 1020, 1320, 0, 12, 8600, 0, 600, 33, 'sunny'],
    [3, 'Uber Eats', 690, 1170, 60, 19, 11800, 700, 1000, 58, 'rain'],
    [5, 'Wolt', 660, 1080, 30, 14, 9200, 500, 700, 40, 'cloudy'],
    [6, '軽貨物', 480, 1020, 60, 38, 18000, 0, 2200, 120, 'sunny'],
    [8, 'Uber Eats', 660, 1200, 60, 20, 12000, 800, 1200, 60, 'sunny'],
    [9, '出前館', 1020, 1350, 30, 15, 9800, 0, 800, 42, 'rain'],
  ];
  return rows.map(([ago, service, start, end, brk, deliveries, earnings, tips, expenses, km, weather], i) => ({
    id: `sample-${i}`,
    date: iso(ago),
    service,
    startMinutes: start,
    endMinutes: end,
    breakMinutes: brk,
    deliveries,
    earnings,
    tips,
    expenses,
    distanceKm: km,
    weather,
    memo: '',
  }));
}

const shots = [
  { name: '01-record', tab: '記録' },
  { name: '02-stats', tab: '分析' },
  { name: '03-settings', tab: '設定' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb'] });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 }, // 6.7 インチ / 実出力は 1290x2796
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  colorScheme: 'light',
});

await context.addInitScript(({ shifts, settings }) => {
  window.localStorage.setItem('haitatsu.shifts.v1', JSON.stringify(shifts));
  window.localStorage.setItem('haitatsu.settings.v1', JSON.stringify(settings));
}, { shifts: sampleShifts(), settings: { monthlyGoal: 250000, fuelCostPerKm: 8, defaultService: 'Uber Eats' } });

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByText('配達ノート').first().waitFor({ timeout: 15000 });

for (const shot of shots) {
  await page.getByLabel(shot.tab, { exact: true }).click();
  await page.waitForTimeout(500);
  const file = `${OUT}/${shot.name}.png`;
  await page.screenshot({ path: file });
  console.log(`${file}`);
}

console.log('ページエラー:', errors.length ? errors : 'なし');
await browser.close();
