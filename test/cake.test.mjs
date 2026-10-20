import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, detailHtml, figureInner, functionLines, highlightC, legend, sourceUrl, mapData, mapHtml, parseMap, parseProgress, regionCode, sourceUrls, specRows, specHtml, tabsHtml, breakdownHtml, headerRows, mapOf, percentOf } from '../assets/js/cake.js';
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
    header: progress.carts[1].header,
  });
  assert.equal(eu.revision, 0);
  assert.equal(eu.header, null);
  assert.throws(() => parseProgress(progress, ['us', 'de']), /no cart for de/);
});

test('parseProgress rejects schema 1, a ROM that does not add up and malformed counts', () => {
  const cart = progress.carts[1];
  assert.throws(() => parseProgress({ ...progress, schema: 1 }, ['us']), /schema 2/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, unknown: cart.unknown + 1 }] }, ['us']), /add up to rom_size/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, blobs: { ...cart.blobs, total: 1 } }] }, ['us']), /decoded \+ identified/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, platform: '4096' }] }, ['us']), /platform is not a count/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, data: undefined }] }, ['us']), /data is missing/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, header: { ...cart.header, crc1: 2 ** 32 } }] }, ['us']), /crc1 is not 32 bits/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, header: { ...cart.header, pi: null } }] }, ['us']), /header is malformed/);
  assert.throws(() => parseProgress({ ...progress, carts: [{ ...cart, header: { ...cart.header, name: 7 } }] }, ['us']), /name is not text/);
});

test('regionCode is the version code up to its first dash', () => {
  assert.deepEqual(['us-rev1', 'us', 'eu', 'eu-x', 'de'].map(regionCode), ['us', 'us', 'eu', 'eu', 'de']);
});

test('spec rows carry exactly the progress.json numbers, the unit in the value column, and no source link', () => {
  const carts = parseProgress(progress, ['us', 'eu']);
  assert.deepEqual(specRows(carts[0]), [
    ['cartridge', 'NUS-NXXE-1'], ['region', 'us'], ['revision', '1'], ['matched fn', '1,234 / 3'],
    ['% .text', '30.77 %'], ['code', '256 / 832 bytes'], ['fuzzy code', '448 bytes'], ['data', '256 / 256 bytes'],
    ['blobs', '4,096 decoded + 2,112 identified bytes'], ['blob types', 'model 1 · sound 1 · texture 2'],
    ['platform', '4,096 bytes'], ['unknown', '119,680 bytes'], ['rom', '131,072 bytes'],
  ]);
  assert.ok(specRows(carts[0]).every(([k]) => !/bytes/.test(k)));
  assert.equal(specRows(carts[1]).some(([k]) => k === 'blob types'), false);
  const html = specHtml(carts[0]);
  assert.doesNotMatch(html, /<a |source|versions/);
});

test('tabs: one per version in the listed order, labelled by cartridge ID, only the selected one selected and focusable', () => {
  const html = tabsHtml(parseProgress(progress, ['us', 'eu']), 'us', '0');
  assert.match(html, /^<div class="tabs" role="tablist" aria-label="rom version">/);
  const tabs = [...html.matchAll(/<button [^>]*data-version="([^"]+)" aria-selected="(true|false)"[^>]*tabindex="(-?\d)"><span class="tab-id">([^<]+)<\/span><span class="tab-v">([^<]+)<\/span>/g)].map((m) => m.slice(1));
  assert.deepEqual(tabs, [['us', 'true', '0', 'NUS-NXXE-1', 'us'], ['eu', 'false', '-1', 'NUS-NXXP-0', 'eu']]);
});

test('the breakdown leads with the header block when the cart has header fields, then one bar of the ROM by class', () => {
  const [us, eu] = parseProgress(progress, ['us', 'eu']);
  const html = breakdownHtml(us);
  assert.match(html, /<div class="bar"><button type="button" class="header-block" aria-haspopup="dialog"[^>]*>header<\/button><span class="parts">/);
  const parts = [...html.matchAll(/<i class="part-(\w+)" style="width:([\d.]+)%"/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(parts.map(([k]) => k), ['code', 'data', 'platform', 'blobs', 'unknown']);
  assert.ok(Math.abs(parts.reduce((a, [, w]) => a + w, 0) - 100) < 0.01);
  assert.match(html, /unknown <b>91\.3 %<\/b>/);
  const plain = breakdownHtml(eu);
  assert.doesNotMatch(plain, /header-block/);
  assert.doesNotMatch(plain, /part-data|part-blobs/);
  assert.equal(percentOf(1, 100000), '< 0.1 %');
  assert.equal(percentOf(0, 10), '0.0 %');
});

test('header rows are parsed fields in hex and words only, never bytes', () => {
  const [us] = parseProgress(progress, ['us']);
  assert.deepEqual(headerRows(us.header), [
    ['internal name', 'Example Game'], ['game id', 'NXXE'], ['country', 'North America'], ['version', '1'], ['release', 'libultra 2.0K'],
    ['entry point', '0x80000400'], ['clock rate', '0x0000000F'], ['pi settings', 'latency 0x40 · pulse width 0x12 · page size 7 · release 3'],
    ['crc1', '0x12345678'], ['crc2', '0x9ABCDEF0'],
  ]);
});

test('mapOf finds the map of a version in maps, or the single map of an older file, else null', () => {
  assert.equal(mapOf(progress, 'eu'), progress.maps[1]);
  assert.equal(mapOf(progress, 'de'), null);
  assert.equal(mapOf(progressTwo, 'us'), progressTwo.map);
  assert.equal(mapOf(progressTwo, 'eu'), null);
});

test('parseMap lists every function, data span, platform span and blob in ROM order, leaving observed blobs out', () => {
  const model = parseMap(progress.maps[0]);
  assert.deepEqual(model.items.map((i) => [i.kind, i.name, i.rom, i.size]), [
    ['platform', 'platform', 0, 0x1000], ['code', 'func_80000400', 0x1000, 256], ['data', 'data', 0x1100, 256], ['code', 'step', 0x3f00, 512],
    ['blobs', 'tex_a', 0x8000, 4096], ['blobs', 'snd_a', 0x9000, 2048], ['blobs', 'over', 0xc000, 128], ['code', 'func_80000900', 0xc040, 64],
  ]);
  assert.deepEqual(model.items.find((i) => i.name === 'step'), { kind: 'code', rank: 'code', name: 'step', rom: 0x3f00, size: 512, percent: 87.5, path: 'src/a.c', line: 40 });
  assert.equal(model.rows.length, 8);
});

test('the map pieces partition the ROM: code, data, platform, blobs and unknown add up to the cart, and code outranks a blob', () => {
  const model = parseMap(progress.maps[0]);
  const bytes = Object.fromEntries(['code', 'data', 'platform', 'blobs', 'unknown'].map((k) => [k, Math.round(layerBytes(model, k))]));
  assert.deepEqual(bytes, { code: 832, data: 256, platform: 4096, blobs: 6208, unknown: 119680 });
  assert.equal(Object.values(bytes).reduce((a, b) => a + b, 0), progress.maps[0].rom_size);
  // The 0xC000 row: the blob keeps 0xC000-0xC040, the function wins 0xC040-0xC080.
  const row = model.rows[3].slices.map((s) => [s.f < 0 ? 'unknown' : model.items[s.f].name, s.left, s.width]);
  assert.deepEqual(row, [['over', 0, 64 / 16384], ['func_80000900', 64 / 16384, 64 / 16384], ['unknown', 128 / 16384, 1 - 128 / 16384]]);
  // A function over two rows is two slices of one item.
  const step = model.items.findIndex((i) => i.name === 'step');
  assert.deepEqual([model.rows[0], model.rows[1]].map((r) => r.slices.filter((s) => s.f === step).length), [1, 1]);
});

test('parseMap refuses malformed input instead of drawing a wrong map', () => {
  assert.throws(() => parseMap(undefined), /no map/);
  assert.throws(() => parseMap({ ...progress.maps[0], fns: [['f', 0x1ffff, 16, 50, null, null]] }), /outside the ROM/);
  assert.throws(() => parseMap({ ...progress.maps[0], fns: [['f', 0, 16, 101, null, null]] }), /map function f/);
  assert.throws(() => parseMap({ ...progress.maps[0], blobs: [['b', 0, 16, 'guessed', 'x']] }), /state/);
  assert.throws(() => parseMap({ ...progress.maps[0], spans: { data: [[8, 4]], platform: [] } }), /outside the ROM/);
  assert.throws(() => parseMap({ ...progress.maps[0], spans: {} }), /spans.data is not a list/);
});

test('mapHtml draws code only: heat per function, no data, platform, blob or unknown slice, and a row without code is dropped', () => {
  const model = parseMap(progress.maps[0]);
  const html = mapHtml(model);
  const rows = [...html.matchAll(/<span class="off">(0x[0-9A-F]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(rows, ['0x000000', '0x004000', '0x00C000']);
  assert.match(html, /<div class="row"><span class="off">0x000000<\/span><span class="track"><i class="exact s" data-f="1" style="left:25%;width:1.563%"><\/i><i class="fuzzy s" data-f="3" style="left:98.438%;width:1.563%;--p:87.5%"><\/i>/);
  assert.match(html, /<i class="none" data-f="7" style="left:0.391%;width:0.391%"><\/i>/);
  assert.doesNotMatch(html, /unknown|blob|data s|platform/);
});

test('mapData indexes files and lines for functions', () => {
  const model = parseMap(progress.maps[0]);
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
  assert.deepEqual([cart.blobs.total, cart.platform, cart.unknown], [0, 4096, 61184]);
  const model = parseMap(progressTwo.map);
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
