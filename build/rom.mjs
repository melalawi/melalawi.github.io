// ROM facts read from each source repo: cartridge IDs from config.toml and a ROM-ordered layout of the .text slices for the memory map.

// [version.<v>] blocks of config.toml: cartridge_id, and the revision it ends in.
export function parseCartridges(toml) {
  const out = new Map();
  const blocks = toml.split(/^\[/m).slice(1);
  for (const block of blocks) {
    const head = /^version\.([A-Za-z0-9_-]+)\]/.exec(block);
    if (!head) continue;
    const field = (key) => {
      const match = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(block);
      return match ? match[1] : null;
    };
    const id = field('cartridge_id');
    if (!id) throw new Error(`config.toml version ${head[1]} has no cartridge_id`);
    const revision = /-(\d+)$/.exec(id);
    out.set(head[1], { id, revision: revision ? Number(revision[1]) : 0 });
  }
  return out;
}

// Short region code of a version: the version code up to its first dash (us-rev1 -> us, eu-x -> eu).
export function regionCode(version) {
  return version.split('-')[0];
}

// ROM offset of a module from its span_<hex> category.
export function segmentOffset(id) {
  const match = /^span_([0-9A-Fa-f]+)$/.exec(id);
  if (!match) throw new Error(`module ${id} has no ROM offset`);
  return parseInt(match[1], 16);
}

// Each function placed at its ROM offset: the segment's ROM start plus its distance from the segment's first function.
export function romLayout(modules) {
  return modules.map((module) => {
    const start = segmentOffset(module.id);
    const base = module.fns[0].address;
    const fns = module.fns.map((fn) => ({ ...fn, rom: start + (fn.address - base) }));
    const last = fns[fns.length - 1];
    return { id: module.id, start, end: last.rom + last.size, fns };
  });
}

// Rows of a fixed byte width, like a hex dump. Slices that cross a row edge are split.
// Each row lists its offset and the slices on it as fractions of the row.
export function mapRows(segments, bytesPerRow) {
  const rows = [];
  for (const segment of segments) {
    const first = Math.floor(segment.start / bytesPerRow) * bytesPerRow;
    const byOffset = new Map();
    for (let offset = first; offset < segment.end; offset += bytesPerRow) {
      const row = { offset, segment: offset === first ? segment : null, slices: [] };
      byOffset.set(offset, row);
      rows.push(row);
    }
    if (rows.length && byOffset.get(first)) byOffset.get(first).boundary = (segment.start - first) / bytesPerRow;
    for (const fn of segment.fns) {
      let from = fn.rom;
      const to = fn.rom + fn.size;
      while (from < to) {
        const offset = Math.floor(from / bytesPerRow) * bytesPerRow;
        const until = Math.min(to, offset + bytesPerRow);
        byOffset.get(offset).slices.push({ fn, left: (from - offset) / bytesPerRow, width: (until - from) / bytesPerRow });
        from = until;
      }
    }
  }
  return rows;
}
