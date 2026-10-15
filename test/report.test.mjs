import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucket,
  compareCounts,
  functionExact,
  functionPercent,
  measuresCounts,
  parseReport,
  readmeCounts,
  totals,
} from '../build/report.mjs';

const unit = (name, category, address, size, percent, { source = true, complete = percent === 100 } = {}) => ({
  name,
  metadata: { complete, progress_categories: [category], ...(source ? { source_path: `src/${name}.c` } : {}) },
  functions: [{ name, address: String(address), size: String(size), ...(percent === undefined ? {} : { fuzzy_match_percent: percent }) }],
});

const report = {
  measures: { matched_code: '200', total_code: '1300', matched_functions: 2, total_functions: 6 },
  units: [
    unit('late', 'span_16E000', 0x80400000, 100, 100),
    { name: 'rodata/x', metadata: { progress_categories: ['span_1000'] }, sections: [] },
    unit('second', 'span_1000', 0x80200200, 300, 50),
    unit('first', 'span_1000', 0x80200100, 100, 100),
    unit('draft', 'span_1000', 0x80200300, 200, 100, { complete: false }),
    unit('middle', 'span_C2860', 0x80300000, 200, undefined),
    unit('asm', 'span_C2860', 0x80300400, 400, 80, { source: false }),
  ],
};

test('functionPercent scores missing C and missing fuzzy as zero', () => {
  assert.equal(functionPercent({ metadata: {} }, { fuzzy_match_percent: 90 }), 0);
  assert.equal(functionPercent({ metadata: { source_path: 'a.c' } }, {}), 0);
  assert.equal(functionPercent({ metadata: { source_path: 'a.c' } }, { fuzzy_match_percent: 101 }), 100);
  assert.equal(functionPercent({ metadata: { source_path: 'a.c' } }, { fuzzy_match_percent: 42.5 }), 42.5);
});

test('functionExact needs a 100 score in a complete unit', () => {
  assert.equal(functionExact({ metadata: { complete: true } }, { fuzzy_match_percent: 100 }), true);
  assert.equal(functionExact({ metadata: { complete: false } }, { fuzzy_match_percent: 100 }), false);
  assert.equal(functionExact({ metadata: { complete: true } }, { fuzzy_match_percent: 99.9 }), false);
});

test('bucket reserves the top step for exact functions', () => {
  assert.deepEqual([0, 0.01, 11.2, 50, 88, 99.99, 100].map((p) => bucket(p, false)), [0, 1, 2, 5, 8, 9, 9]);
  assert.equal(bucket(100, true), 10);
});

test('parseReport groups by module in ROM order and sorts by address', () => {
  const parsed = parseReport(report);
  assert.deepEqual(
    parsed.modules.map((m) => [m.id, m.fns.map((f) => f.name)]),
    [
      ['span_1000', ['first', 'second', 'draft']],
      ['span_C2860', ['middle', 'asm']],
      ['span_16E000', ['late']],
    ],
  );
  assert.throws(() => parseReport({}), /no units/);
});

test('totals count exact functions and weight code by bytes', () => {
  const t = parseReport(report).totals;
  assert.equal(t.functions, 6);
  assert.equal(t.exact, 2);
  assert.equal(t.fuzzy, 2);
  assert.equal(t.none, 2);
  assert.equal(t.bytes, 1300);
  assert.equal(t.exactBytes, 200);
  assert.equal(t.exactPercent, (200 / 1300) * 100);
  assert.equal(t.fuzzyPercent, (100 * 100 + 300 * 50 + 100 * 100 + 200 * 100) / 1300);
  assert.equal(totals([]).exactPercent, 0);
});

test('computed totals agree with the report measures', () => {
  const parsed = parseReport(report);
  assert.deepEqual(compareCounts('r', parsed.totals, measuresCounts(parsed.measures)), []);
});

test('compareCounts names every count that differs', () => {
  const computed = { exactBytes: 463468, bytes: 1130220, exact: 1959, functions: 3488 };
  const expected = { exactBytes: 518144, bytes: 1130220, exact: 2141, functions: 3488 };
  assert.deepEqual(compareCounts('rw us-rev1', computed, expected), [
    'rw us-rev1: exactBytes computed 463468 but 518144 expected',
    'rw us-rev1: exact computed 1959 but 2141 expected',
  ]);
});

const README = `# Game

<!-- progress -->
<pre><code>all      [██▒░]  52.36% (~86.17%)  3,591,464 of 6,857,872 bytes</code></pre>

| de (NUS-0, Germany). SHA256 \`abc\` |
|---|
| <pre><code>code      [██▒░]  43.14% (~84.92%)  476,856 of 1,105,268</code><br><code>data      [██░]  94.61%  262,404 of 277,340</code><br><code>functions [██▒░]  59.58% (~93.39%)  2,057 of 3,452</code></pre> |

| us-rev1 (NUS-1, North America). SHA256 \`def\` |
|---|
| <pre><code>code      [██▒░]  45.84% (~87.86%)  518,144 of 1,130,220</code><br><code>functions [██▒░]  61.38% (~95.72%)  2,141 of 3,488</code></pre> |
<!-- /progress -->
`;

test('readmeCounts reads the code and functions rows per version', () => {
  const counts = readmeCounts(README);
  assert.deepEqual([...counts.keys()], ['de', 'us-rev1']);
  assert.deepEqual(counts.get('us-rev1'), { exactBytes: 518144, bytes: 1130220, exact: 2141, functions: 3488 });
  assert.deepEqual(counts.get('de'), { exactBytes: 476856, bytes: 1105268, exact: 2057, functions: 3452 });
  assert.throws(() => readmeCounts('# none'), /no progress block/);
});
