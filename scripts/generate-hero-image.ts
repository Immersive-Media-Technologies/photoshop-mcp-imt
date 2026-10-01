/**
 * Generate images/readme-hero-v2.png — dark, minimal typography hero.
 *
 * Renders an SVG and screenshots it with headless Chrome (no new deps).
 * Override the Chrome binary with CHROME_PATH when needed.
 *
 * Run: npx tsx scripts/generate-hero-image.ts
 * Outputs: images/readme-hero-v2.svg + images/readme-hero-v2.png (1600x800)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

const WIDTH = 1600;
const HEIGHT = 800;
const IMAGES_DIR = join(process.cwd(), 'images');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1020"/>
      <stop offset="1" stop-color="#070a14"/>
    </linearGradient>
    <linearGradient id="psTile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f2a4a"/>
      <stop offset="1" stop-color="#0a1d36"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#31a8ff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#31a8ff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="390" cy="400" r="480" fill="url(#glow)"/>

  <!-- Ps tile -->
  <g transform="translate(230,250)">
    <rect width="300" height="300" rx="52" fill="url(#psTile)" stroke="#1d3d63" stroke-width="2"/>
    <text x="150" y="204" text-anchor="middle" font-family="-apple-system, 'Segoe UI', Arial, sans-serif"
      font-size="160" font-weight="700" fill="#31a8ff">Ps</text>
  </g>

  <!-- wordmark + copy -->
  <text x="600" y="388" font-family="-apple-system, 'Segoe UI', Arial, sans-serif"
    font-size="80" font-weight="700" fill="#f2f5fa">Photoshop MCP</text>
  <text x="602" y="458" font-family="-apple-system, 'Segoe UI', Arial, sans-serif"
    font-size="34" font-weight="400" fill="#9aa7bd">Tell Photoshop what you want — AI does the clicking.</text>
  <text x="602" y="516" font-family="-apple-system, 'Segoe UI', Arial, sans-serif"
    font-size="24" font-weight="400" fill="#5c6b84">Cursor · Claude · built-in chat — no code required</text>
</svg>
`;

function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (platform() === 'darwin')
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (platform() === 'win32')
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return 'google-chrome';
}

const svgPath = join(IMAGES_DIR, 'readme-hero-v2.svg');
const pngPath = join(IMAGES_DIR, 'readme-hero-v2.png');
writeFileSync(svgPath, svg);

execFileSync(chromePath(), [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  `--window-size=${WIDTH},${HEIGHT}`,
  `--screenshot=${pngPath}`,
  `file://${svgPath}`,
]);

console.log(`✓ ${svgPath}`);
console.log(`✓ ${pngPath} (${WIDTH}x${HEIGHT})`);
