/**
 * Packs the UXP bridge plugin into a .ccx (a zip of the uxp-plugin/ folder).
 * The user installs it by double-clicking dist/uxp/ps-mcp-imt-bridge.ccx →
 * Creative Cloud installs the plugin into Photoshop (Plugins → PS-MCP-IMT Bridge).
 * Run: node scripts/pack-uxp.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'uxp-plugin');
const OUT_DIR = join(ROOT, 'dist', 'uxp');
const OUT = join(OUT_DIR, 'ps-mcp-imt-bridge.ccx');

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });
rmSync(OUT, { force: true });
// .ccx = a zip with manifest.json at the root (no wrapper folder)
const FILES = ['manifest.json', 'index.html', 'main.js'];
if (process.platform === 'win32') {
  // Windows has no `zip`; its bsdtar (System32\tar.exe, Windows 10+) writes zip archives.
  const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['--format', 'zip', '-cf', OUT, ...FILES], { cwd: SRC, stdio: 'inherit' });
} else {
  execFileSync('zip', ['-q', '-r', '-X', OUT, ...FILES], { cwd: SRC, stdio: 'inherit' });
}
console.log(`uxp: ${manifest.id} ${manifest.version} → ${OUT}`);
