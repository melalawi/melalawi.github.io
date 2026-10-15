import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailHtml, figureInner, functionLines, highlightC, sourceUrl, mapData, mapHtml, parseMap, parseProgress, regionCode, sourceUrls, specRows, versionTable } from '../assets/js/cake.js';
import { progress, svg, symbols } from './fixtures.mjs';

test('sourceUrls point at main of the repo for the default version', () => {
  assert.deepEqual(sourceUrls('Org/game-one', 'us'), {
    progress: 'https://raw.githubusercontent.com/Org/game-one/main/progress.json',
    map: 'https://raw.githubusercontent.com/Org/game-one/main/docs/memory-map-us.svg',
    symbols: 'https://raw.githubusercontent.com/Org/game-one/main/versions/us/symbols.json',
  });
});

test('parseProgress orders carts by the listed versions and reads the revision from the cartridge ID', () => {
  const [us, eu] = parseProgress(progress, ['us', 'eu']);
  assert.deepEqual(us, { version: 'us', id: 'NUS-NXXE-1', revision: 1, fn: 1234, fnTotal: 3, text: 30.77, bytes: 256, fuzzy: 512, asm: 64, bytesTotal: 832 });
  assert.equal(eu.revision, 0);
  assert.throws(() => parseProgress(progress, ['us', 'de']), /no cart for de/);
  assert.throws(() => parseProgress({ ...progress, schema: 2 }, ['us']), /schema 1/);
  const broken = { ...progress, carts: [{ ...progress.carts[1], bytes: { ...progress.carts[1].bytes, fuzzy: '512' } }] };
  assert.throws(() => parseProgress(broken, ['us']), /bytes.fuzzy/);
});

test('regionCode is the version code up to its first dash', () => {
  assert.deepEqual(['us-rev1', 'us', 'eu', 'eu-x', 'de'].map(regionCode), ['us', 'us', 'eu', 'eu', 'de']);
});

test('spec rows and the version table carry exactly the progress.json numbers', () => {
  const carts = parseProgress(progress, ['us', 'eu']);
  assert.deepEqual(specRows(carts[0], ['us', 'eu']), [
    ['cartridge', 'NUS-NXXE-1'], ['region', 'us'], ['revision', '1'], ['versions', 'us, eu'], ['matched fn', '1,234 / 3'],
    ['% .text', '30.77 %'], ['matched bytes', '256 / 832 B'], ['fuzzy bytes', '512 B'], ['asm bytes', '64 B'],
  ]);
  const table = versionTable(carts);
  assert.match(table, /<tr><td>us<\/td><td>NUS-NXXE-1<\/td><td data-label="fn">1,234\/3<\/td><td data-label=".text">30.77%<\/td><td data-label="B">256\/832<\/td><td data-label="fuzzy B">512<\/td><td data-label="asm B">64<\/td><\/tr>/);
  assert.match(table, /<th>fuzzy B<\/th><th>asm B<\/th>/);
});

test('parseMap reads functions in ROM order, joins a function split over rows and links symbols', () => {
  const model = parseMap(svg, symbols);
  assert.deepEqual(model.fns, [
    { name: 'func_80000400', percent: 100, size: 256, rom: 0x1000, q: 10, path: 'src/a.c', line: 3 },
    { name: 'step', percent: 87.5, size: 512, rom: 0x3f00, q: 8, path: 'src/a.c', line: 40 },
    { name: 'func_80000900', percent: 0, size: 64, rom: 0xc040, q: 0, path: null, line: null },
  ]);
  assert.deepEqual(model.rows.map((r) => [r.offset, r.slices.map((s) => s.f), r.edges, r.segment && [r.segment.start, r.segment.end, r.segment.count]]), [
    [0, [0, 1], [0.25], [0x1000, 0x4100, 2]],
    [0x4000, [1], [], undefined],
    [0xc000, [2], [0.00390625], [0xc040, 0xc080, 1]],
  ]);
});

test('parseMap refuses malformed input instead of drawing a wrong map', () => {
  assert.throws(() => parseMap('<svg></svg>', symbols), /viewBox/);
  assert.throws(() => parseMap(svg, { functions: {} }), /symbols.json/);
  assert.throws(() => parseMap(svg.replace('· 256 B', '256'), symbols), /is not "name/);
});

test('mapHtml draws slices, segment labels and edges; mapData indexes files and lines', () => {
  const model = parseMap(svg, symbols);
  const html = mapHtml(model);
  assert.match(html, /<div class="seg">0x001000–0x004100 · 2 fn<\/div><div class="row"><span class="off">0x000000<\/span><span class="track"><b class="edge" style="left:25%"><\/b><i class="q10 s" data-f="0" style="left:25%;width:1.563%"><\/i>/);
  assert.match(html, /<i class="q8 s" data-f="1" style="left:98.438%;width:1.563%"><\/i>/);
  assert.match(html, /<div class="seg">0x00C040–0x00C080 · 1 fn<\/div>/);
  assert.match(html, /<i class="q0" data-f="2" style="left:0.391%;width:0.391%"><\/i>/);
  assert.deepEqual(mapData(model, 'Org/game-one'), {
    repo: 'Org/game-one',
    units: ['src/a.c'],
    fns: [['func_80000400', 0, 100, 256, 0x1000, 3], ['step', 0, 87.5, 512, 0x3f00, 40], ['func_80000900', -1, 0, 64, 0xc040, 0]],
  });
  assert.match(figureInner(model, 'Org/game-one'), /^<p class="readout" hidden><\/p>\n<script type="application\/json" class="map-data">/);
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
