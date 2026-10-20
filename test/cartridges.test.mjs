import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartridgeId, mismatches, parseReadme } from '../build/cartridges.mjs';

const readme = `<!-- progress -->

| us (NUS-NXXE-1, North America). Revised. SHA256 \`abc\` |
|---|
| <pre><code>rom         [█░░░]  40.00%  4,000 of 10,000 bytes</code><br><code>├ header    100</code><br><code>├ code      [█░░░]  50.00%  1,000 of 2,000</code><br><code>├ data      [█░░░]  10.00%  1 of 10</code><br><code>└ blobs     [█░░░]  10.00%  1 of 10</code><br><code>functions   [█░░░]  50.00%  2 of 4</code></pre> |
`;
const cart = { id: 'NUS-NXXE-1', version: 'us', functions: { matched: 2, total: 4 }, code: { matched: 1000, total: 2000 } };

test('parseReadme reads the cartridge ID, code bytes and functions of each version from its ROM tree', () => {
  assert.deepEqual([...parseReadme(readme)], [['us', { id: 'NUS-NXXE-1', code: [1000, 2000], functions: [2, 4] }]]);
});

test('mismatches is empty when progress and README agree and names each disagreement otherwise', () => {
  const entry = parseReadme(readme).get('us');
  assert.deepEqual(mismatches('us', cart, entry), []);
  const bad = mismatches('us', { ...cart, id: 'NUS-NXXE-0', functions: { matched: 3, total: 4 } }, entry);
  assert.equal(bad.length, 2);
  assert.match(bad[0], /us cartridge: progress "NUS-NXXE-0", README "NUS-NXXE-1"/);
  assert.match(bad[1], /us matched fn: progress 3, README 2/);
  assert.deepEqual(mismatches('de', cart, undefined), ['de: README has no entry']);
});

test('cartridgeId returns the default version ID, throws when a total disagrees and returns null (skipped) when schema 2 progress.json is missing', async () => {
  const game = { repo: 'Org/g', versions: ['us'], default: 'us' };
  const files = (progress, schema = 2) => async (url) => (url.split('/main/')[1] === 'progress.json' ? JSON.stringify({ schema, carts: [progress] }) : readme);
  assert.equal(await cartridgeId(game, files(cart)), 'NUS-NXXE-1');
  await assert.rejects(cartridgeId(game, files({ ...cart, code: { matched: 999, total: 2000 } })), /Org\/g totals disagree:\nus matched bytes/);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await cartridgeId(game, files(cart, 1)), null);
    const missing = async (url) => { throw Object.assign(new Error(`${url}: HTTP 404`), { status: 404 }); };
    assert.equal(await cartridgeId(game, missing), null);
  } finally {
    console.warn = warn;
  }
  const down = async () => { throw Object.assign(new Error('HTTP 500'), { status: 500 }); };
  await assert.rejects(cartridgeId(game, down), /HTTP 500/);
});
