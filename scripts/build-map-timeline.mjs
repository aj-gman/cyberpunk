#!/usr/bin/env node
/**
 * build-map-timeline.mjs — assemble one dated map-viewer snapshot from an
 * Azgaar FMG .map save plus the SVG layers produced by fmg_extract_layers.py.
 *
 * Usage:
 *   node scripts/build-map-timeline.mjs \
 *     --save path/to/save.map \
 *     --layers path/to/extracted-svgs \
 *     --date 2077-05 \
 *     --label "May 2077"
 *
 * Reads:  basemap.svg / cultures.svg / religions.svg / zones.svg /
 *         borders.svg / routes.svg / burgicons.svg / labels.svg from
 *         --layers (whichever exist), produced by scripts/fmg_extract_map.py.
 * Writes: src/site/img/map-viewer/data/<date>/   (layer SVGs + meta.json)
 *         src/site/img/map-viewer/data/manifest.json  (entry added/replaced)
 *
 * Notes:
 *   - --date is the in-world timeline key (YYYY-MM). It is never guessed
 *     from the file's filesystem date; ask the user for it.
 *   - Layer SVGs must be in FMG canvas coordinates (viewBox 0 0 1920 1080);
 *     the viewer stretches them onto the 15360x8640 tile grid (exactly 8x).
 *   - Names can repeat across ids; paths are keyed on id + fill color.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}
const { save, layers, date, label } = args;
if (!save || !layers || !date || !label) {
  console.error('Required: --save <file.map> --layers <dir> --date <YYYY-MM> --label "<label>"');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(date)) {
  console.error(`--date "${date}" must be a lowercase slug (e.g. 2077-05)`);
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewerDir = args.out || join(repoRoot, 'src/site/img/map-viewer');
const dataDir = join(viewerDir, 'data');
const dateDir = join(dataDir, date);

// ── 1. Tables from the .map save (cultures + religions, incl. extinct) ──
const raw = readFileSync(save);
const tables = {};
for (const line of raw.toString('utf8').split('\n')) {
  const t = line.trimStart();
  try {
    if (t.startsWith('[{"name":"Default"')) {
      tables.cultures = JSON.parse(t).map(({ i, name, color }) => ({ i, name, color }));
    } else if (t.startsWith('[{"name":"No religion"')) {
      tables.religions = JSON.parse(t).map(({ i, name, color }) => ({ i, name, color }));
    }
  } catch { /* not a table line */ }
}
if (!tables.cultures || !tables.religions) {
  console.error('Could not find cultures/religions tables in the save - is this an FMG .map file?');
  process.exit(1);
}

// ── 2. Copy + normalize layer SVGs ──────────────────────────────────────
// FMG draw order; the viewer stacks them the same way.
const KNOWN_LAYERS = ['basemap', 'cultures', 'religions', 'zones', 'borders', 'routes', 'burgicons', 'labels'];
mkdirSync(dateDir, { recursive: true });
const available = [];
for (const layer of KNOWN_LAYERS) {
  const src = join(layers, `${layer}.svg`);
  if (!existsSync(src)) continue;
  let svg = readFileSync(src, 'utf8');
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!vb) { console.error(`${layer}.svg: no viewBox - skipped`); continue; }
  if (vb[1] !== '1920' || vb[2] !== '1080') {
    console.error(`WARNING: ${layer}.svg viewBox is ${vb[1]}x${vb[2]}, expected 1920x1080`);
  }
  // Exact stretch onto the 8x tile grid; interactive hover handled by the
  // viewer. Defs, styles, masks, hatches and fonts stay untouched - the
  // extracted layers rely on them for faithful rendering.
  if (!svg.includes('preserveAspectRatio')) {
    svg = svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
  }
  // Verify every filled region path against the save's own table.
  const prefix = { cultures: 'culture', religions: 'religion' }[layer];
  if (prefix && tables[layer]) {
    const byId = new Map(tables[layer].map((e) => [e.i, e]));
    for (const m of svg.matchAll(/<path[^>]*>/g)) {
      const attrs = Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
      if (!attrs.id || !attrs.id.startsWith(prefix) || attrs.id.includes('-gap')) continue;
      if (!attrs.fill || attrs.fill === 'none') continue;
      const id = Number(attrs.id.slice(prefix.length));
      const entry = byId.get(id);
      if (!entry) { console.error(`WARNING: ${layer} path ${attrs.id} has no table entry`); continue; }
      if (entry.color.toLowerCase() !== attrs.fill.toLowerCase()) {
        console.error(`WARNING: ${layer} id ${id} fill ${attrs.fill} != table ${entry.name} ${entry.color}`);
      }
    }
  }
  writeFileSync(join(dateDir, `${layer}.svg`), svg);
  available.push(layer);
  console.log(`${layer}: ${(svg.match(/<path/g) || []).length} paths -> data/${date}/${layer}.svg`);
}
if (available.length === 0) {
  console.error('No layer SVGs found in --layers dir. Run fmg_extract_layers.py first.');
  process.exit(1);
}

// ── 3. meta.json (tables incl. extinct entries, for legends) ────────────
writeFileSync(join(dateDir, 'meta.json'), JSON.stringify({ label, tables }, null, 2) + '\n');

// ── 4. manifest.json ────────────────────────────────────────────────────
const manifestPath = join(dataDir, 'manifest.json');
let manifest = { dates: [] };
if (existsSync(manifestPath)) manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.dates = manifest.dates.filter((d) => d.id !== date);
manifest.dates.push({ id: date, label, layers: available });
manifest.dates.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest: ${manifest.dates.length} date(s): ${manifest.dates.map((d) => d.id).join(', ')}`);
