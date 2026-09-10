// アイコン類を SVG から生成する。デザインを直したいときはここだけ触れば全サイズ揃う。
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const BLUE = '#0b6bcb';
const DEEP = '#08519b';

/** 記録が積み上がって手取りが伸びていく、という中身をそのまま形にする */
function icon({ background = true } = {}) {
  const bars = [
    { x: 232, y: 620, h: 150 },
    { x: 392, y: 520, h: 250 },
    { x: 552, y: 400, h: 370 },
    { x: 712, y: 300, h: 470 },
  ]
    .map((b) => `<rect x="${b.x}" y="${b.y}" width="110" height="${b.h}" rx="26" fill="#ffffff" opacity="${background ? 0.96 : 1}"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${background ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${DEEP}"/>
    </linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/>` : ''}
  ${bars}
  <text x="200" y="330" font-family="Helvetica, Arial, sans-serif" font-size="300" font-weight="700"
        fill="#ffffff" opacity="${background ? 1 : 1}">¥</text>
</svg>`;
}

const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(112,112) scale(0.78)">
    ${icon({ background: false }).replace(/<\/?svg[^>]*>/g, '')}
  </g>
</svg>`;

const solid = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BLUE}"/></svg>`;

const targets = [
  { file: 'assets/icon.png', svg: icon(), size: 1024, flatten: true },
  { file: 'assets/splash-icon.png', svg: icon(), size: 512, flatten: true },
  { file: 'assets/favicon.png', svg: icon(), size: 64, flatten: true },
  { file: 'assets/android-icon-foreground.png', svg: foreground, size: 1024, flatten: false },
  { file: 'assets/android-icon-background.png', svg: solid, size: 1024, flatten: true },
  { file: 'assets/android-icon-monochrome.png', svg: foreground, size: 1024, flatten: false },
];

for (const target of targets) {
  let pipeline = sharp(Buffer.from(target.svg)).resize(target.size, target.size);
  // iOS のアイコンは透過を許さないので、背景を敷いてから書き出す
  if (target.flatten) pipeline = pipeline.flatten({ background: BLUE });
  const buffer = await pipeline.png().toBuffer();
  writeFileSync(target.file, buffer);
  console.log(`${target.file} (${target.size}x${target.size}, ${buffer.length} bytes)`);
}
