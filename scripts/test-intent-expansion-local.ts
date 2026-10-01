/**
 * Local integration test for prompt-intent-expansion features only.
 * Tests 4 new atomics, 4 new recipes, 4 new recipe prompts, 4 guide prompts.
 *
 * Run: npx tsx scripts/test-intent-expansion-local.ts
 * Optional: TEST_IMAGE=/path/to/photo.jpg (for select_subject / remove_background)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_CHAT_ID = 'intent-expansion-local';
const EXPORT_DIR = join(homedir(), '.photoshop-mcp', 'exports', TEST_CHAT_ID);
const TEST_IMAGE = process.env.TEST_IMAGE;

type Outcome = 'pass' | 'fail' | 'skip' | 'warn';

interface Result {
  group: string;
  name: string;
  outcome: Outcome;
  detail: string;
  ms: number;
}

const results: Result[] = [];

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function short(text: string, max = 160): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

function record(group: string, name: string, outcome: Outcome, detail: string, ms: number): void {
  results.push({ group, name, outcome, detail, ms });
  const tag = outcome === 'pass' ? 'OK  ' : outcome === 'skip' ? 'SKIP' : outcome === 'warn' ? 'WARN' : 'FAIL';
  console.log(`  ${tag} ${name} (${ms}ms) — ${short(detail)}`);
}

function textFrom(result: {
  content?: Array<{ type: string; text?: string }>;
}): string {
  return (result.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

function writeTestPng(path: string, color: 'red' | 'blue' = 'red'): void {
  const rgb = color === 'red' ? '255,0,0' : '0,80,200';
  execSync(
    `python3 -c "import struct,zlib,binascii; w=h=128; rows=b''.join(b'\\x00'+bytes([${rgb.split(',').join(',')}])*w for _ in range(h)); comp=zlib.compress(rows,9); crc=lambda t,d: struct.pack('>I',binascii.crc32(t+d)&0xffffffff); ch=lambda t,d: struct.pack('>I',len(d))+t+d+crc(t,d); png=b'\\x89PNG\\r\\n\\x1a\\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+ch(b'IDAT',comp)+ch(b'IEND',b''); open('${path}','wb').write(png)"`,
    { stdio: 'ignore' }
  );
}

async function call(
  client: Client,
  group: string,
  name: string,
  args: Record<string, unknown> = {},
  opts: { skip?: string; required?: boolean } = {}
): Promise<boolean> {
  if (opts.skip) {
    record(group, name, 'skip', opts.skip, 0);
    return false;
  }
  const started = Date.now();
  try {
    const result = await client.callTool({ name, arguments: args });
    const ms = Date.now() - started;
    const body = textFrom(result);
    if (result.isError) {
      record(group, name, 'fail', body, ms);
      if (opts.required) throw new Error(`${name}: ${body}`);
      return false;
    }
    record(group, name, 'pass', body, ms);
    return true;
  } catch (error) {
    const ms = Date.now() - started;
    const msg = error instanceof Error ? error.message : String(error);
    record(group, name, 'fail', msg, ms);
    if (opts.required) throw error;
    return false;
  }
}

async function getPrompt(
  client: Client,
  group: string,
  name: string,
  args: Record<string, string>,
  mustInclude: string[]
): Promise<void> {
  const started = Date.now();
  try {
    const pr = await client.getPrompt({ name, arguments: args });
    const text = pr.messages
      .map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    const ms = Date.now() - started;
    const missing = mustInclude.filter((m) => !text.includes(m));
    if (missing.length > 0) {
      record(group, name, 'fail', `missing: ${missing.join(', ')}`, ms);
      return;
    }
    record(group, name, 'pass', `${text.length} chars`, ms);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record(group, name, 'fail', msg, 0);
  }
}

function summary(): void {
  const pass = results.filter((r) => r.outcome === 'pass').length;
  const fail = results.filter((r) => r.outcome === 'fail').length;
  const skip = results.filter((r) => r.outcome === 'skip').length;
  const warn = results.filter((r) => r.outcome === 'warn').length;

  console.log('\n========================================');
  console.log(`INTENT EXPANSION: ${pass} pass, ${fail} fail, ${skip} skip, ${warn} warn (${results.length} total)`);
  console.log('========================================');

  if (fail > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => x.outcome === 'fail')) {
      console.log(`  [${r.group}] ${r.name}: ${r.detail}`);
    }
  }
  if (skip > 0) {
    console.log('\nSkipped (need real photo or manual setup):');
    for (const r of results.filter((x) => x.outcome === 'skip')) {
      console.log(`  [${r.group}] ${r.name}: ${r.detail}`);
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(EXPORT_DIR, { recursive: true });
  const testPng = join(tmpdir(), 'photoshop-mcp-test.png');
  const skyPng = join(tmpdir(), 'photoshop-mcp-sky.png');
  writeTestPng(testPng, 'red');
  writeTestPng(skyPng, 'blue');

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', join(ROOT, 'src/index.ts')],
    env: {
      ...process.env,
      LOG_LEVEL: '0',
      PHOTOSHOP_EXPORT_CHAT_ID: TEST_CHAT_ID,
    },
    stderr: 'pipe',
    cwd: ROOT,
  });

  const client = new Client({ name: 'intent-expansion-test', version: '1.0.0' });
  await client.connect(transport);

  section('0 — Photoshop bağlantısı');
  const pingOk = await call(client, 'bootstrap', 'photoshop_ping', {}, { required: true });
  if (!pingOk) {
    console.error('\nPhotoshop açık değil veya MCP bağlanamıyor. Photoshop\'u açıp tekrar deneyin.');
    await transport.close();
    process.exit(1);
  }
  await call(client, 'bootstrap', 'photoshop_get_capabilities', {}, { required: true });

  section('1 — Test dokümanı hazırlığı');
  await call(client, 'setup', 'photoshop_execute_script', {
    code: `while (app.documents.length > 0) { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } return { closed: true };`,
  });
  await call(client, 'setup', 'photoshop_create_document', { width: 1200, height: 800 }, { required: true });
  await call(client, 'setup', 'photoshop_create_layer', { name: 'Subject' });
  await call(client, 'setup', 'photoshop_fill_layer', { red: 200, green: 60, blue: 40 });
  await call(client, 'setup', 'photoshop_place_image', { filePath: testPng, x: 400, y: 300 });

  if (TEST_IMAGE && existsSync(TEST_IMAGE)) {
    section('1b — Gerçek fotoğraf (TEST_IMAGE)');
    await call(client, 'setup', 'photoshop_open_image', { filePath: TEST_IMAGE });
    console.log(`  → Aktif doküman: ${TEST_IMAGE}`);
  } else {
    console.log('  (TEST_IMAGE yok — sentetik kanvas; select_subject atlanacak)');
  }

  section('2 — Yeni atomik araçlar (Phase 3)');
  // Curves + fill need a normal art layer (not Background / locked Smart Object-only path).
  await call(client, 'atomic', 'photoshop_execute_script', {
    code: `var doc=app.activeDocument; for(var i=0;i<doc.artLayers.length;i++){var L=doc.artLayers[i]; if(L.name.indexOf('Subject')>=0){doc.activeLayer=L;break;}} return {active:doc.activeLayer.name,kind:String(doc.activeLayer.kind)};`,
  });
  await call(client, 'atomic', 'photoshop_adjust_curves', { preset: 'auto_tone' });
  await call(client, 'atomic', 'photoshop_undo', { steps: 1 });

  // Content-aware fill edits the active layer's pixels — use Background (recipe path validated this).
  await call(client, 'atomic', 'photoshop_execute_script', {
    code: `app.activeDocument.activeLayer=app.activeDocument.layers[app.activeDocument.layers.length-1]; while(app.activeDocument.activeLayer.parent.typename==='LayerSet'){app.activeDocument.activeLayer=app.activeDocument.activeLayer.parent;} return {active:app.activeDocument.activeLayer.name};`,
  });
  await call(client, 'atomic', 'photoshop_select_rectangle', { left: 100, top: 100, right: 350, bottom: 350 });
  await call(client, 'atomic', 'photoshop_content_aware_fill');
  await call(client, 'atomic', 'photoshop_undo', { steps: 1 });
  await call(client, 'atomic', 'photoshop_deselect');

  await call(client, 'atomic', 'photoshop_select_rectangle', { left: 50, top: 50, right: 500, bottom: 500 });
  await call(client, 'atomic', 'photoshop_create_layer_mask');
  await call(client, 'atomic', 'photoshop_apply_gradient_mask', { direction: 'bottom_to_top' });
  await call(client, 'atomic', 'photoshop_undo', { steps: 1 });
  await call(client, 'atomic', 'photoshop_delete_layer_mask');
  await call(client, 'atomic', 'photoshop_deselect');

  await call(client, 'atomic', 'photoshop_select_subject', undefined, {
    skip: TEST_IMAGE
      ? undefined
      : 'set TEST_IMAGE=/path/to/portrait.jpg for selectSubject (needs recognizable subject)',
  });

  section('3 — Yeni recipe araçları (Phase 4)');
  await call(client, 'recipe', 'photoshop_execute_script', {
    code: `var doc=app.activeDocument; for(var i=0;i<doc.artLayers.length;i++){var L=doc.artLayers[i]; if(L.name.indexOf('Subject')>=0){doc.activeLayer=L;break;}} return {active:doc.activeLayer.name,isBackground:L.isBackgroundLayer};`,
  });

  await call(client, 'recipe', 'photoshop_recipe_gradient_fade', { direction: 'bottom_to_top' });
  await call(client, 'recipe', 'photoshop_undo', { steps: 1 });

  await call(client, 'recipe', 'photoshop_recipe_dodge_burn', { blend_mode: 'overlay' });
  await call(client, 'recipe', 'photoshop_undo', { steps: 1 });

  await call(client, 'recipe', 'photoshop_select_rectangle', { left: 200, top: 200, right: 400, bottom: 400 });
  await call(client, 'recipe', 'photoshop_recipe_remove_distraction', { feather_px: 2 });
  await call(client, 'recipe', 'photoshop_undo', { steps: 1 });

  await call(client, 'recipe', 'photoshop_recipe_sky_blend', {
    sky_image_path: skyPng,
    horizon_pct: 40,
    feather_pct: 12,
  });
  await call(client, 'recipe', 'photoshop_undo', { steps: 1 });

  section('4 — Yeni recipe prompt şablonları (Phase 5)');
  await getPrompt(client, 'recipe-prompt', 'ps.gradient_fade', { direction: 'bottom_to_top' }, [
    'photoshop_recipe_gradient_fade',
  ]);
  await getPrompt(client, 'recipe-prompt', 'ps.sky_blend', {
    sky_image_path: skyPng,
    horizon_pct: '40',
  }, ['photoshop_recipe_sky_blend']);
  await getPrompt(client, 'recipe-prompt', 'ps.dodge_burn', { blend_mode: 'overlay' }, [
    'photoshop_recipe_dodge_burn',
  ]);
  await getPrompt(client, 'recipe-prompt', 'ps.remove_distraction', { feather_px: '2' }, [
    'photoshop_recipe_remove_distraction',
  ]);

  section('5 — Guide prompt şablonları (Phase 1/5)');
  await getPrompt(client, 'guide-prompt', 'ps.gradient_blend', { direction: 'bottom_to_top' }, [
    'photoshop_recipe_gradient_fade',
    'photoshop_apply_gradient_mask',
  ]);
  await getPrompt(client, 'guide-prompt', 'ps.color_correct', { preset: 'auto_tone' }, [
    'photoshop_adjust_curves',
  ]);
  await getPrompt(client, 'guide-prompt', 'ps.dodge_burn_guide', {}, [
    'photoshop_recipe_dodge_burn',
    'ps.dodge_burn',
  ]);
  await getPrompt(client, 'guide-prompt', 'ps.composite_blend', {}, [
    'photoshop_recipe_sky_blend',
    'ps.sky_blend',
  ]);

  section('6 — Önizleme');
  await call(client, 'preview', 'photoshop_get_preview', { max_dimension_px: 512, quality: 7 });

  section('7 — Temizlik');
  await call(client, 'cleanup', 'photoshop_close_document', { save: false });

  summary();
  await transport.close();

  const failed = results.filter((r) => r.outcome === 'fail').length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
