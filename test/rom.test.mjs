import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRows, parseCartridges, regionCode, romLayout, segmentOffset } from '../build/rom.mjs';

test('parseCartridges reads cartridge ID and revision per version', () => {
  const carts = parseCartridges('[project]\nname = "x"\n\n[version.de]\ncartridge_id = "NUS-NXXD-0"\nregion = "Germany"\n\n[version.us-rev1]\ncartridge_id = "NUS-NXXE-1"\nregion = "North America"\n\n[[resident.de]]\nstart = 1\n');
  assert.deepEqual([...carts.entries()], [
    ['de', { id: 'NUS-NXXD-0', revision: 0 }],
    ['us-rev1', { id: 'NUS-NXXE-1', revision: 1 }],
  ]);
  assert.throws(() => parseCartridges('[version.us]\nregion = "x"\n'), /no cartridge_id/);
});

test('regionCode is the version code up to its first dash', () => {
  assert.deepEqual(['us-rev1', 'us', 'eu', 'eu-x', 'de'].map(regionCode), ['us', 'us', 'eu', 'eu', 'de']);
});

test('romLayout places functions at the segment ROM offset plus their address distance', () => {
  assert.equal(segmentOffset('span_16E000'), 0x16e000);
  const [segment] = romLayout([{ id: 'span_1000', fns: [{ address: 0x80000400, size: 0x20 }, { address: 0x80000428, size: 0x10 }] }]);
  assert.deepEqual(segment.fns.map((f) => f.rom), [0x1000, 0x1028]);
  assert.equal(segment.end, 0x1038);
  assert.throws(() => romLayout([{ id: 'unknown', fns: [{ address: 1, size: 1 }] }]), /no ROM offset/);
});

test('mapRows wraps at a fixed width, splits crossing slices and marks segment starts', () => {
  const segments = romLayout([{ id: 'span_0C', fns: [{ address: 0, size: 2, name: 'a' }, { address: 2, size: 8, name: 'b' }] }]);
  const rows = mapRows(segments, 8);
  assert.deepEqual(rows.map((r) => r.offset), [8, 16]);
  assert.equal(rows[0].segment, segments[0]);
  assert.equal(rows[0].boundary, 0.5);
  assert.deepEqual(rows[0].slices.map((s) => [s.fn.name, s.left, s.width]), [['a', 0.5, 0.25], ['b', 0.75, 0.25]]);
  assert.deepEqual(rows[1].slices.map((s) => [s.fn.name, s.left, s.width]), [['b', 0, 0.75]]);
  const bytes = rows.flatMap((r) => r.slices).reduce((sum, s) => sum + s.width * 8, 0);
  assert.equal(bytes, 10);
});
