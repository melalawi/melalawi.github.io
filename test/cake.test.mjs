import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, state, detailHtml, figureInner, functionLines, highlightC, legend, sourceUrl, mapData, mapHtml, parseLayers, parseMap, parseProgress, regionCode, sourceUrls, specRows, versionTable } from '../assets/js/cake.js';
import { progress, progressTwo } from './fixtures.mjs';

const layerBytes = (model, kind) => model.rows.flatMap((r) => r.slices)
  .filter((s) => (kind === 'unknown' ? s.f < 0 : s.f >= 0 && model.items[s.f].kind === kind))
  .reduce((sum, s) => sum + s.width * 16384, 0);

test('sourceUrls point at the progress.json on main of the repo', () => {
  assert.deepEqual(sourceUrls('Org/game-one'), { progress: 'https://raw.githubusercontent.com/Org/game-one/main/progress.json' });
});

test('parseProgress orders carts by the listed versions, reads the revision and carries every layer', () => {
  const [us, eu] = parseProgress(progress, ['us', 'eu']);
  assert.deepEqual(us, {
    version: 'us', id: 'NUS-NXXE-1', revision: 1, fn: 1234, fnTotal: 3, text: (256 / 832) * 100,
    code: { matched: 256, fuzzy: 448, total: 832 }, data: { matched: 256, fuzzy: 0, total: 256 },
    blobs: { decoded: 4096, identified: 2112, total: 6208, types: progress.carts[1].blobs.by_type }, platform: 4096, unknown: 119680, romSize: 131072,
  });
  assert.equal(eu.revision, 0);
  assert.throws(() => parseProgress(progress, ['us', 'de']), /no cart for de/);
});

test('parseProgress rejects schema 1, a ROM that does not add up and malformed counts', () => {
  const cart = progress.carts[1];
  assert.throws(() => parseProgress({ ...progress, schema: 1 }, ['us']), /schema 2/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, unknown: cart.unknown + 1 }] }, ['us']), /add up to rom_size/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, blobs: { ...cart.blobs, total: 1 } }] }, ['us']), /decoded \+ identified/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, platform: '4096' }] }, ['us']), /platform is not a count/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, data: undefined }] }, ['us']), /data is missing/);
});

test('regionCode is the version code up to its first dash', () => {
  assert.deepEqual(['us-rev1', 'us', 'eu', 'eu-x', 'de'].map(regionCode), ['us', 'us', 'eu', 'eu', 'de']);
});

test('spec rows and the version table carry exactly the progress.json numbers, one column per layer', () => {
  const carts = parseProgress(progress, ['us', 'eu']);
  assert.deepEqual(specRows(carts[0], ['us', 'eu']), [
    ['cartridge', 'NUS-NXXE-1'], ['region', 'us'], ['revision', '1'], ['versions', 'us, eu'], ['matched fn', '1,234 / 3'],
    ['% .text', '30.77 %'], ['code bytes', '256 / 832 B'], ['fuzzy bytes', '448 B'], ['data bytes', '256 / 256 B'],
    ['blobs bytes', '4,096 decoded + 2,112 identified B'], ['blob types', 'model 1 · sound 1 · texture 2'],
    ['platform bytes', '4,096 B'], ['unknown bytes', '119,680 B'], ['rom', '131,072 B'],
  ]);
  assert.equal(specRows(carts[1], ['us', 'eu']).some(([k]) => k === 'blob types'), false);
  const table = versionTable(carts);
  assert.match(table, /<tr><td>us<\/td><td>NUS-NXXE-1<\/td><td data-label="fn">1,234\/3<\/td><td data-label=".text">30.77%<\/td><td data-label="code B">256\/832<\/td><td data-label="data B">256\/256<\/td><td data-label="blobs B">4,096\/6,208<\/td><td data-label="unknown B">119,680<\/td><\/tr>/);
  assert.match(table, /<th>data B<\/th><th>blobs B<\/th><th>unknown B<\/th>/);
});

test('parseMap lists every function, data span, platform span and blob in ROM order, leaving observed blobs out', () => {
  const model = parseMap(progress.map);
  assert.deepEqual(model.items.map((i) => [i.kind, i.name, i.rom, i.size]), [
    ['platform', 'platform', 0, 0x1000], ['code', 'func_80000400', 0x1000, 256], ['data', 'data', 0x1100, 256], ['code', 'step', 0x3f00, 512],
    ['blobs', 'tex_a', 0x8000, 4096], ['blobs', 'snd_a', 0x9000, 2048], ['blobs', 'over', 0xc000, 128], ['code', 'func_80000900', 0xc040, 64],
  ]);
  assert.deepEqual(model.items.find((i) => i.name === 'step'), { kind: 'code', rank: 'code', name: 'step', rom: 0x3f00, size: 512, percent: 87.5, path: 'src/a.c', line: 40 });
  assert.equal(model.rows.length, 8);
});

test('the map pieces partition the ROM: code, data, platform, blobs and unknown add up to the cart, and code outranks a blob', () => {
  const model = parseMap(progress.map);
  const bytes = Object.fromEntries(['code', 'data', 'platform', 'blobs', 'unknown'].map((k) => [k, Math.round(layerBytes(model, k))]));
  assert.deepEqual(bytes, { code: 832, data: 256, platform: 4096, blobs: 6208, unknown: 119680 });
  assert.equal(Object.values(bytes).reduce((a, b) => a + b, 0), progress.map.rom_size);
  // The 0xC000 row: the blob keeps 0xC000-0xC040, the function wins 0xC040-0xC080.
  const row = model.rows[3].slices.map((s) => [s.f < 0 ? 'unknown' : model.items[s.f].name, s.left, s.width]);
  assert.deepEqual(row, [['over', 0, 64 / 16384], ['func_80000900', 64 / 16384, 64 / 16384], ['unknown', 128 / 16384, 1 - 128 / 16384]]);
  // A function over two rows is two slices of one item.
  const step = model.items.findIndex((i) => i.name === 'step');
  assert.deepEqual([model.rows[0], model.rows[1]].map((r) => r.slices.filter((s) => s.f === step).length), [1, 1]);
});

test('parseMap refuses malformed input instead of drawing a wrong map', () => {
  assert.throws(() => parseMap(undefined), /no map/);
  assert.throws(() => parseMap({ ...progress.map, fns: [['f', 0x1ffff, 16, 50, null, null]] }), /outside the ROM/);
  assert.throws(() => parseMap({ ...progress.map, fns: [['f', 0, 16, 101, null, null]] }), /map function f/);
  assert.throws(() => parseMap({ ...progress.map, blobs: [['b', 0, 16, 'guessed', 'x']] }), /state/);
  assert.throws(() => parseMap({ ...progress.map, spans: { data: [[8, 4]], platform: [] } }), /outside the ROM/);
  assert.throws(() => parseMap({ ...progress.map, spans: {} }), /spans.data is not a list/);
});

test('mapHtml draws every layer by default: heat for code, own colors for data, platform and blobs, an empty track for unknown', () => {
  const model = parseMap(progress.map);
  const html = mapHtml(model);
  assert.match(html, /<div class="row"><span class="off">0x000000<\/span><span class="track"><i class="platform s" data-f="0" style="left:0%;width:25%"><\/i><i class="exact s" data-f="1" style="left:25%;width:1.563%"><\/i><i class="data s" data-f="2" style="left:26.563%;width:1.563%"><\/i><i class="unknown s" style="left:28.125%;width:70.313%"><\/i><i class="fuzzy s" data-f="3" style="left:98.438%;width:1.563%;--p:87.5%"><\/i>/);
  assert.match(html, /<i class="blob decoded s" data-f="4" style="left:0%;width:25%"><\/i>/);
  assert.match(html, /<i class="blob identified" data-f="6" style="left:0%;width:0.391%"><\/i><i class="none" data-f="7" style="left:0.391%;width:0.391%"><\/i>/);
  assert.equal((html.match(/<div class="row">/g) || []).length, 8);
});

test('layer filtering draws only the shown layers and drops a row with nothing to draw', () => {
  const model = parseMap(progress.map);
  const only = (...names) => mapHtml(model, new Set(names));
  const rows = (html) => [...html.matchAll(/<span class="off">(0x[0-9A-F]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(rows(only('code')), ['0x000000', '0x004000', '0x00C000']);
  assert.doesNotMatch(only('code'), /unknown|blob|data s|platform/);
  assert.deepEqual(rows(only('blobs')), ['0x008000', '0x00C000']);
  assert.deepEqual(rows(only('platform')), ['0x000000']);
  assert.deepEqual(rows(only('data')), ['0x000000']);
  assert.equal(rows(only('unknown')).length, 8);
  assert.equal(rows(only()).length, 0);
  assert.equal(mapHtml(model, new Set(LAYERS)), mapHtml(model));
});

test('mapData indexes files and lines for functions and carries the kind and blob state of every item', () => {
  const model = parseMap(progress.map);
  const data = mapData(model, 'Org/game-one');
  assert.deepEqual(data.units, ['src/a.c']);
  assert.deepEqual(data.fns[1], ['func_80000400', 0, 100, 256, 0x1000, 3, null, 'code', null]);
  assert.deepEqual(data.fns[4], ['tex_a', -1, null, 4096, 0x8000, 0, null, 'blobs', ['decoded', 'texture']]);
  assert.deepEqual(data.fns[0], ['platform', -1, null, 0x1000, 0, 0, null, 'platform', null]);
  assert.match(figureInner(model, 'Org/game-one'), /^<p class="readout" hidden><\/p>\n<script type="application\/json" class="map-data">/);
});

test('the legend has one checked checkbox per layer, only the shown ones checked, and the blob key', () => {
  const all = legend();
  assert.deepEqual([...all.matchAll(/data-layer="(\w+)" checked/g)].map((m) => m[1]), ['code', 'data', 'blobs', 'platform', 'unknown']);
  assert.match(all, /<label><input type="checkbox" data-layer="code" checked> code<\/label>/);
  assert.match(all, /<i class="blob identified"><\/i>identified<\/span><span><i class="blob decoded"><\/i>decoded/);
  assert.deepEqual([...legend(new Set(['blobs'])).matchAll(/data-layer="(\w+)" checked/g)].map((m) => m[1]), ['blobs']);
});

test('parseLayers reads the stored layers and falls back to all five', () => {
  assert.deepEqual([...parseLayers(null)], LAYERS);
  assert.deepEqual([...parseLayers('{')], LAYERS);
  assert.deepEqual([...parseLayers('["code","tex"]')], LAYERS);
  assert.deepEqual([...parseLayers('["platform","code"]')].sort(), ['code', 'platform']);
  assert.deepEqual([...parseLayers('[]')], []);
});

test('a game without blobs still renders all five layers', () => {
  const [cart] = parseProgress(progressTwo, ['us']);
  assert.deepEqual([cart.blobs.total, cart.platform, cart.unknown], [0, 4096, 61184]);
  const model = parseMap(progressTwo.map);
  assert.equal(model.rows.length, 4);
  assert.deepEqual(['code', 'data', 'platform', 'unknown'].map((k) => Math.round(layerBytes(model, k))), [192, 64, 4096, 61184]);
  const html = mapHtml(model);
  for (const cls of ['exact', 'none', 'data', 'platform', 'unknown']) assert.match(html, new RegExp(`<i class="${cls}[ "]`));
  assert.doesNotMatch(html, /class="blob/);
});

const code = `int other(void) { return 1; }
/* } */
static int step(int x) {
  char c = '}';
  if (x) { return 0x10; }
  return "}"[0];
}
int after(void) { return 2; }`;

test('functionLines runs from the line to the closing brace and ignores braces in comments and literals', () => {
  assert.equal(functionLines(code, 3), code.split('\n').slice(2, 7).join('\n'));
  assert.equal(functionLines(code, 1), 'int other(void) { return 1; }');
  assert.equal(functionLines(code, 99), null);
  assert.equal(functionLines('int f(void) {', 1), null);
});

test('highlightC wraps keywords, numbers, strings, comments and preprocessor lines and escapes the rest', () => {
  assert.equal(highlightC('#include "a.h"\nif (a < 0x10) /* x */ return "s";'),
    '<span class="tp">#include &quot;a.h&quot;</span>\n<span class="tk">if</span> (a &lt; <span class="tn">0x10</span>) <span class="tc">/* x */</span> <span class="tk">return</span> <span class="ts">&quot;s&quot;</span>;');
});

test('detailHtml shows the summary and the C, each only when present; sourceUrl links the line', () => {
  assert.equal(detailHtml({}), '');
  assert.equal(detailHtml({ summary: 'adds <1>' }), '<p class="fn-what">adds &lt;1&gt;</p>');
  assert.match(detailHtml({ code: 'return 1;' }), /^<section class="fn-c"><h3>c<\/h3><pre><span class="tk">return<\/span> <span class="tn">1<\/span>;<\/pre><\/section>$/);
  assert.equal(sourceUrl('Org/g', 'src/a.c', 3), 'https://github.com/Org/g/blob/main/src/a.c#L3');
});
