import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, detailHtml, figureInner, functionLines, highlightC, legend, sourceUrl, mapData, mapHtml, parseMap, parseProgress, sourceUrls, specRows, specHtml, tabsHtml, breakdownHtml, headerRows, mapUrl, percentOf } from '../assets/js/cake.js';
import { maps, mapTwo, progress, progressTwo } from './fixtures.mjs';

const layerBytes = (model, kind) => model.rows.flatMap((r) => r.slices)
  .filter((s) => (kind === 'unknown' ? s.f < 0 : s.f >= 0 && model.items[s.f].kind === kind))
  .reduce((sum, s) => sum + s.width * 16384, 0);

test('sourceUrls point at the progress.json on main of the repo', () => {
  assert.deepEqual(sourceUrls('Org/game-one'), { progress: 'https://raw.githubusercontent.com/Org/game-one/main/progress.json' });
});

test('parseProgress orders carts by the listed versions and carries the ROM size, its parts and the functions', () => {
  const [us, eu] = parseProgress(progress, ['us', 'eu']);
  assert.deepEqual(us, {
    version: 'us', id: 'NUS-NXXE-1', romSize: 131072,
    code: { matched: 256, total: 832 }, data: { matched: 256, total: 256 }, blobs: { decoded: 4096, total: 6208 },
    header: progress.carts[1].header, functions: { matched: 1234, total: 3 },
  });
  assert.equal(eu.header.game_id, 'NXXP');
  assert.throws(() => parseProgress(progress, ['us', 'de']), /no cart for de/);
});

test('parseProgress rejects schema 1, parts over the ROM, a missing header and malformed counts', () => {
  const cart = progress.carts[1];
  assert.throws(() => parseProgress({ ...progress, schema: 1 }, ['us']), /schema 2/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, rom_size: 6208 + 832 + 256 + 4095 }] }, ['us']), /parts are over rom_size/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, blobs: { decoded: 2, total: 1 } }] }, ['us']), /decoded is over total/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, data: undefined }] }, ['us']), /data is missing/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, header: undefined }] }, ['us']), /header is malformed/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, header: { ...cart.header, bytes: '4096' } }] }, ['us']), /header.bytes is not a count/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, header: { ...cart.header, crc1: 2 ** 32 } }] }, ['us']), /crc1 is not 32 bits/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, header: { ...cart.header, name: 7 } }] }, ['us']), /name is not text/);
});

test('spec rows: the ROM first, its parts under it, then functions; no fuzzy, unknown, platform or blob types', () => {
  const [us] = parseProgress(progress, ['us']);
  assert.deepEqual(specRows(us), [
    ['rom', '8,704 / 131,072 bytes', 0],
    ['header', '4,096 bytes', 1],
    ['code', '256 / 832 bytes', 1],
    ['data', '256 / 256 bytes', 1],
    ['blobs', '4,096 / 6,208 bytes', 2],
    ['functions', '1,234 / 3', 0],
  ]);
  const html = specHtml(us);
  assert.match(html, /^<dl class="spec"><div><dt>rom<\/dt>[\s\S]*<div class="branch"><dt>header<\/dt>[\s\S]*<div class="branch last"><dt>blobs<\/dt>[\s\S]*<div><dt>functions<\/dt>/);
  assert.doesNotMatch(html, /<a |source|fuzzy|unknown|platform|identified|texture/);
});

test('tabs: one per version in the listed order, labelled by cartridge ID, only the selected one selected and focusable', () => {
  const html = tabsHtml(parseProgress(progress, ['us', 'eu']), 'us', '0');
  assert.match(html, /^<div class="tabs" role="tablist" aria-label="rom version">/);
  const tabs = [...html.matchAll(/<button [^>]*data-version="([^"]+)" aria-selected="(true|false)"[^>]*tabindex="(-?\d)"><span class="tab-id">([^<]+)<\/span><span class="tab-v">([^<]+)<\/span>/g)].map((m) => m.slice(1));
  assert.deepEqual(tabs, [['us', 'true', '0', 'NUS-NXXE-1', 'us'], ['eu', 'false', '-1', 'NUS-NXXP-0', 'eu']]);
});

test('the breakdown leads with the header block, then code, data and blobs, leaving the rest of the ROM empty', () => {
  const [us, eu] = parseProgress(progress, ['us', 'eu']);
  const html = breakdownHtml(us);
  assert.match(html, /<div class="bar"><button type="button" class="header-block" aria-haspopup="dialog"[^>]*>header<\/button><span class="parts">/);
  const parts = [...html.matchAll(/<i class="part-(\w+)" style="width:([\d.]+)%"/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(parts.map(([k]) => k), ['code', 'data', 'blobs']);
  assert.ok(Math.abs(parts.reduce((a, [, w]) => a + w, 0) - ((832 + 256 + 6208) / 131072) * 100) < 0.01);
  assert.match(html, /blobs <b>4\.7 %<\/b>/);
  assert.doesNotMatch(html, /unknown|platform/);
  assert.deepEqual([...breakdownHtml(eu).matchAll(/part-(\w+)" style/g)].map((m) => m[1]), ['code']);
  assert.equal(percentOf(1, 100000), '< 0.1 %');
  assert.equal(percentOf(0, 10), '0.0 %');
});

test('header rows are parsed fields in hex and words only, never bytes', () => {
  const [us] = parseProgress(progress, ['us']);
  assert.deepEqual(headerRows(us.header), [
    ['size', '4,096 bytes with the boot code'], ['internal name', 'Example Game'], ['game id', 'NXXE'], ['country', 'North America'], ['version', '1'], ['release', 'libultra 2.0K'],
    ['entry point', '0x80000400'], ['clock rate', '0x0000000F'], ['pi settings', 'latency 0x40 · pulse width 0x12 · page size 7 · release 3'],
    ['crc1', '0x12345678'], ['crc2', '0x9ABCDEF0'],
  ]);
});

test('every version map is its own file on main, and parseMap reads only a schema 1 map file', () => {
  assert.equal(mapUrl('Org/game-one', 'us-rev1'), 'https://raw.githubusercontent.com/Org/game-one/main/docs/map-us-rev1.json');
  assert.equal(parseMap(maps.eu).items.length, 2);
  assert.throws(() => parseMap({ ...maps.us, schema: undefined }), /not schema 1/);
  assert.throws(() => parseMap(undefined), /not schema 1/);
  assert.equal('map' in progress || 'maps' in progress, false);
});

test('parseMap lists every function, data span, platform span and blob in ROM order, leaving observed blobs out', () => {
  const model = parseMap(maps.us);
  assert.deepEqual(model.items.map((i) => [i.kind, i.name, i.rom, i.size]), [
    ['platform', 'platform', 0, 0x1000], ['code', 'func_80000400', 0x1000, 256], ['data', 'data', 0x1100, 256], ['code', 'step', 0x3f00, 512],
    ['blobs', 'tex_a', 0x8000, 4096], ['blobs', 'snd_a', 0x9000, 2048], ['blobs', 'over', 0xc000, 128], ['code', 'func_80000900', 0xc040, 64],
  ]);
  assert.deepEqual(model.items.find((i) => i.name === 'step'), { kind: 'code', rank: 'code', name: 'step', rom: 0x3f00, size: 512, percent: 87.5, path: 'src/a.c', line: 40 });
  assert.equal(model.rows.length, 8);
});

test('the map pieces partition the ROM: code, data, platform, blobs and unknown add up to the cart, and code outranks a blob', () => {
  const model = parseMap(maps.us);
  const bytes = Object.fromEntries(['code', 'data', 'platform', 'blobs', 'unknown'].map((k) => [k, Math.round(layerBytes(model, k))]));
  assert.deepEqual(bytes, { code: 832, data: 256, platform: 4096, blobs: 6208, unknown: 119680 });
  assert.equal(Object.values(bytes).reduce((a, b) => a + b, 0), maps.us.rom_size);
  // The 0xC000 row: the blob keeps 0xC000-0xC040, the function wins 0xC040-0xC080.
  const row = model.rows[3].slices.map((s) => [s.f < 0 ? 'unknown' : model.items[s.f].name, s.left, s.width]);
  assert.deepEqual(row, [['over', 0, 64 / 16384], ['func_80000900', 64 / 16384, 64 / 16384], ['unknown', 128 / 16384, 1 - 128 / 16384]]);
  // A function over two rows is two slices of one item.
  const step = model.items.findIndex((i) => i.name === 'step');
  assert.deepEqual([model.rows[0], model.rows[1]].map((r) => r.slices.filter((s) => s.f === step).length), [1, 1]);
});

test('parseMap refuses malformed input instead of drawing a wrong map', () => {
  assert.throws(() => parseMap(undefined), /not schema 1/);
  assert.throws(() => parseMap({ ...maps.us, fns: [['f', 0x1ffff, 16, 50, null, null]] }), /outside the ROM/);
  assert.throws(() => parseMap({ ...maps.us, fns: [['f', 0, 16, 101, null, null]] }), /map function f/);
  assert.throws(() => parseMap({ ...maps.us, blobs: [['b', 0, 16, 'guessed', 'x']] }), /state/);
  assert.throws(() => parseMap({ ...maps.us, spans: { data: [[8, 4]], platform: [] } }), /outside the ROM/);
  assert.throws(() => parseMap({ ...maps.us, spans: {} }), /spans.data is not a list/);
});

test('mapHtml draws code only: heat per function, no data, platform, blob or unknown slice, and a row without code is dropped', () => {
  const model = parseMap(maps.us);
  const html = mapHtml(model);
  const rows = [...html.matchAll(/<span class="off">(0x[0-9A-F]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(rows, ['0x000000', '0x004000', '0x00C000']);
  assert.match(html, /<div class="row"><span class="off">0x000000<\/span><span class="track"><i class="exact s" data-f="1" style="left:25%;width:1.563%"><\/i><i class="fuzzy s" data-f="3" style="left:98.438%;width:1.563%;--p:87.5%"><\/i>/);
  assert.match(html, /<i class="none" data-f="7" style="left:0.391%;width:0.391%"><\/i>/);
  assert.doesNotMatch(html, /unknown|blob|data s|platform/);
});

test('mapData indexes files and lines for functions', () => {
  const model = parseMap(maps.us);
  const data = mapData(model, 'Org/game-one');
  assert.deepEqual(data.units, ['src/a.c']);
  assert.deepEqual(data.fns[1], ['func_80000400', 0, 100, 256, 0x1000, 3, null]);
  assert.match(figureInner(model, 'Org/game-one'), /^<p class="readout" hidden><\/p>\n<script type="application\/json" class="map-data">/);
});

test('the legend is one 0 % to 100 % scale with no layer checkboxes or blob key', () => {
  const html = legend();
  assert.match(html, /<i class="none"><\/i><i class="fuzzy"><\/i><i class="exact"><\/i><span>0 %<\/span><span>100 %<\/span>/);
  assert.doesNotMatch(html, /checkbox|blob/);
});

test('a game without blobs still parses its numbers and draws only code on the map', () => {
  const [cart] = parseProgress(progressTwo, ['us']);
  assert.deepEqual([cart.blobs.total, cart.header.bytes, cart.romSize], [0, 4096, 65536]);
  const model = parseMap(mapTwo);
  assert.equal(model.rows.length, 4);
  const html = mapHtml(model);
  for (const cls of ['exact', 'none']) assert.match(html, new RegExp(`<i class="${cls}[ "]`));
  assert.doesNotMatch(html, /class="(blob|data|platform|unknown)/);
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
