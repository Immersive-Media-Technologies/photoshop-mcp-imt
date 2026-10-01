/**
 * Deep Artisan 29.09: упаковка UXP-плагина моста в .ccx (zip папки uxp-plugin/).
 * Установка пользователем: двойной клик по dist/uxp/deepartisan-ps-bridge.ccx →
 * Creative Cloud ставит плагин в Photoshop (Plugins → Deep Artisan Bridge).
 * Run: node scripts/pack-uxp.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'uxp-plugin');
const OUT_DIR = join(ROOT, 'dist', 'uxp');
const OUT = join(OUT_DIR, 'deepartisan-ps-bridge.ccx');

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });
rmSync(OUT, { force: true });
// .ccx = zip с manifest.json в корне (без папки-обёртки)
execFileSync('zip', ['-q', '-r', '-X', OUT, 'manifest.json', 'index.html', 'main.js'], { cwd: SRC, stdio: 'inherit' });
console.log(`uxp: ${manifest.id} ${manifest.version} → ${OUT}`);
