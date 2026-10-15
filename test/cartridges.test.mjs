import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartridgeId, exactFunctions, mismatches, parseReadme } from '../build/cartridges.mjs';

const readme = `<!-- progress -->

| us (NUS-NXXE-1, North America). Revised. SHA256 \`abc\` |
|---|
| <pre><code>code      [█░░░]  50.00% (~60.00%)  1,000 of 2,000</code><br><code>data      [█░░░]  10.00%  1 of 10</code><br><code>functions [█░░░]  50.00% (~90.00%)  2 of 4</code></pre> |
`;
const unit = (name, complete, ...percents) => ({
  name,
  measures: { total_code: '100', complete_code: complete ? '100' : '40' },
  functions: percents.map((fuzzy_match_percent, i) => ({ name: `${name}${i}`, ...(fuzzy_match_percent === undefined ? {} : { fuzzy_match_percent }) })),
});
const report = {
  measures: { matched_functions: 2, total_functions: 4, matched_code: '1000', total_code: '2000' },
  units: [unit('a', true, 100, 100), unit('b', false, 100, 50), unit('c', true)],
};
const cart = { id: 'NUS-NXXE-1', version: 'us', functions: { matched: 2, total: 4 }, bytes: { matched: 1000, total: 2000 } };

test('parseReadme reads the cartridge ID, code bytes and functions of each version', () => {
  assert.deepEqual([...parseReadme(readme)], [['us', { id: 'NUS-NXXE-1', code: [1000, 2000], functions: [2, 4] }]]);
});

test('exactFunctions counts fuzzy 100 only in units whose code is complete', () => {
  assert.equal(exactFunctions({ units: report.units.slice(0, 2) }), 2);
});

test('mismatches is empty when progress, report and README agree and names each disagreement otherwise', () => {
  const entry = parseReadme(readme).get('us');
  assert.deepEqual(mismatches('us', cart, report, entry), []);
  const bad = mismatches('us', { ...cart, id: 'NUS-NXXE-0', functions: { matched: 3, total: 4 } }, report, entry);
  assert.equal(bad.length, 2);
  assert.match(bad[0], /us cartridge: progress "NUS-NXXE-0", README "NUS-NXXE-1"/);
  assert.match(bad[1], /us matched fn: progress 3, report 2, report exact fn 2, README 2/);
  assert.deepEqual(mismatches('de', cart, report, undefined), ['de: README has no entry']);
});

test('cartridgeId returns the default version ID and throws when a total disagrees', async () => {
  const game = { repo: 'Org/g', versions: ['us'], default: 'us' };
  const files = (progress) => async (url) => {
    const path = url.split('/main/')[1];
    return path === 'progress.json' ? JSON.stringify({ carts: [progress] }) : path === 'README.md' ? readme : JSON.stringify(report);
  };
  assert.equal(await cartridgeId(game, files(cart)), 'NUS-NXXE-1');
  await assert.rejects(cartridgeId(game, files({ ...cart, bytes: { matched: 999, total: 2000 } })), /Org\/g totals disagree:\nus matched bytes/);
});
