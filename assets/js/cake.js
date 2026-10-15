// Cake unbake data and markup for the page script, which fetches each repo's published files from main on every
// visit. Pure: no DOM, no fetch, so the tests run it in node.
//   progress.json                {schema:1, carts:[{id, version, functions:{matched,total}, text_pct, bytes:{matched,fuzzy,asm,total}}]}
//   docs/memory-map-<v>.svg      one <g> per 16 KiB ROM row; each <rect class="qN"> a function slice titled "name · P% · S B"
//   versions/<v>/symbols.json    {schema:1, functions:{name:{path,line}}}; asm-only functions are absent

export const BYTES_PER_ROW = 16384;
const SEPARATED = 0.006;

export function rawUrl(repo, path) {
  return `https://raw.githubusercontent.com/${repo}/main/${path}`;
}

export function sourceUrls(repo, version) {
  return {
    progress: rawUrl(repo, 'progress.json'),
    map: rawUrl(repo, `docs/memory-map-${version}.svg`),
    symbols: rawUrl(repo, `versions/${version}/symbols.json`),
  };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;
const n = (value) => value.toLocaleString('en-US');
const pct = (value) => `${value.toFixed(2)}%`;
const hex = (value, digits = 6) => `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`;
const share = (fraction) => `${(fraction * 100).toFixed(3).replace(/\.?0+$/, '')}%`;
const whole = (value, what) => {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`progress.json: ${what} is not a count`);
  return value;
};

// The carts of progress.json by version code, checked, for the versions the page lists.
export function parseProgress(progress, versions) {
  if (!progress || progress.schema !== 1 || !Array.isArray(progress.carts)) throw new TypeError('progress.json is not schema 1');
  const byVersion = new Map();
  for (const cart of progress.carts) {
    const text = cart.text_pct;
    if (typeof text !== 'number' || !Number.isFinite(text)) throw new TypeError(`progress.json: ${cart.version} text_pct`);
    byVersion.set(cart.version, {
      version: String(cart.version),
      id: String(cart.id),
      revision: Number((/-(\d+)$/.exec(cart.id) || [0, 0])[1]),
      fn: whole(cart.functions.matched, 'functions.matched'),
      fnTotal: whole(cart.functions.total, 'functions.total'),
      text,
      bytes: whole(cart.bytes.matched, 'bytes.matched'),
      fuzzy: whole(cart.bytes.fuzzy, 'bytes.fuzzy'),
      asm: whole(cart.bytes.asm, 'bytes.asm'),
      bytesTotal: whole(cart.bytes.total, 'bytes.total'),
    });
  }
  return versions.map((version) => {
    if (!byVersion.has(version)) throw new Error(`progress.json has no cart for ${version}`);
    return byVersion.get(version);
  });
}

// Short region code of a version: the version code up to its first dash (us-rev1 -> us, eu-x -> eu).
export function regionCode(version) {
  return version.split('-')[0];
}

export function specRows(cart, versions) {
  return [
    ['cartridge', cart.id],
    ['region', regionCode(cart.version)],
    ['revision', String(cart.revision)],
    ['versions', versions.join(', ')],
    ['matched fn', `${n(cart.fn)} / ${n(cart.fnTotal)}`],
    ['% .text', `${cart.text.toFixed(2)} %`],
    ['matched bytes', `${n(cart.bytes)} / ${n(cart.bytesTotal)} B`],
    ['fuzzy bytes', `${n(cart.fuzzy)} B`],
    ['asm bytes', `${n(cart.asm)} B`],
  ];
}

export function specHtml(cart, versions, repo) {
  const rows = specRows(cart, versions).map(([k, v]) => `<div><dt>${k}</dt><dd>${e(v)}</dd></div>`).join('');
  return `<dl class="spec">${rows}<div><a href="https://github.com/${e(repo)}">source</a></div></dl>`;
}

// One line per ROM version: version code, cartridge (its code carries region and revision) and the counts.
// data-label is the short label a narrow column shows beside each value once the header row is hidden.
export function versionTable(carts) {
  const cell = (label, value) => `<td data-label="${label}">${value}</td>`;
  const body = carts
    .map((c) => `<tr><td>${e(c.version)}</td><td>${e(c.id)}</td>${[
      cell('fn', `${n(c.fn)}/${n(c.fnTotal)}`),
      cell('.text', pct(c.text)),
      cell('B', `${n(c.bytes)}/${n(c.bytesTotal)}`),
      cell('fuzzy B', n(c.fuzzy)),
      cell('asm B', n(c.asm)),
    ].join('')}</tr>`)
    .join('\n');
  return `<div class="versions"><table class="table">
<thead><tr><th>version</th><th>cartridge</th><th>matched fn</th><th>% .text</th><th>matched B</th><th>fuzzy B</th><th>asm B</th></tr></thead>
<tbody>
${body}
</tbody>
</table></div>`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (all, name) => ENTITIES[name]);

// The published memory map SVG as functions in ROM order and rows of slices. The track starts at the leftmost
// slice x of any row and spans the rest of the view box; a slice's ROM offset is its row offset plus its x share.
// A function split over two rows is one function. Segments split at gaps in the row offsets and at the hairline
// marks (class h); each segment's first row carries its range and function count and an edge where it starts.
export function parseMap(svg, symbols) {
  const view = /viewBox="0 0 ([\d.]+) [\d.]+"/.exec(svg);
  if (!view) throw new TypeError('memory map has no viewBox');
  if (!symbols || symbols.schema !== 1 || typeof symbols.functions !== 'object') throw new TypeError('symbols.json is not schema 1');
  const groups = [...svg.matchAll(/<g transform="translate\(0 [\d.]+\)"><text[^>]*>([0-9A-Fa-f]+)<\/text>([\s\S]*?)<\/g>/g)];
  if (!groups.length) throw new TypeError('memory map has no rows');
  const parsed = groups.map(([, offset, body]) => ({
    offset: parseInt(offset, 16),
    rects: [...body.matchAll(/<rect class="(q\d+)" x="([\d.]+)" width="([\d.]+)"[^>]*><title>([^<]*)<\/title><\/rect>/g)].map((m) => ({
      q: Number(m[1].slice(1)),
      x: Number(m[2]),
      w: Number(m[3]),
      title: unescape(m[4]),
    })),
    marks: [...body.matchAll(/<rect class="h" x="([\d.]+)"/g)].map((m) => Number(m[1])),
  }));
  const left = Math.min(...parsed.flatMap((row) => row.rects.map((r) => r.x)));
  const width = Number(view[1]) - left;
  const fns = [];
  const rows = [];
  const boundaries = [];
  let last = null;
  let end = -1;
  for (const row of parsed) {
    const slices = [];
    for (const mark of row.marks) {
      const at = (mark - left) / width;
      if (at > 0 && at < 1) boundaries.push(row.offset + Math.round(at * BYTES_PER_ROW));
    }
    for (const r of row.rects) {
      const t = /^(.+) · ([\d.]+)% · (\d+) B$/.exec(r.title);
      if (!t) throw new TypeError(`memory map slice "${r.title}" is not "name · P% · S B"`);
      const from = row.offset + Math.round(((r.x - left) / width) * BYTES_PER_ROW);
      let f = fns.length - 1;
      // A slice continues the previous function when it has the same name and starts where that slice ended.
      if (!last || last.name !== t[1] || Math.abs(from - end) > 16) {
        const symbol = Object.prototype.hasOwnProperty.call(symbols.functions, t[1]) ? symbols.functions[t[1]] : null;
        last = { name: t[1], percent: Number(t[2]), size: Number(t[3]), rom: from, q: r.q, path: symbol ? symbol.path : null, line: symbol ? symbol.line : null, row: rows.length };
        fns.push(last);
        f = fns.length - 1;
      }
      fns[f].lastRow = rows.length;
      end = from + Math.round((r.w / width) * BYTES_PER_ROW);
      slices.push({ f, q: r.q, left: (r.x - left) / width, width: r.w / width });
    }
    rows.push({ offset: row.offset, slices, edges: [] });
  }
  // Segments: a new one where a row gap or a hairline mark falls between a function and the one before it.
  let segment = null;
  fns.forEach((fn, i) => {
    const prev = fns[i - 1];
    const gap = prev && fn.row > prev.lastRow && rows[fn.row].offset !== rows[fn.row - 1].offset + BYTES_PER_ROW;
    const cut = prev && boundaries.some((b) => b > prev.rom && b <= fn.rom);
    if (!prev || gap || cut) {
      const row = rows[fn.row];
      segment = { start: fn.rom, end: fn.rom + fn.size, count: 0 };
      if (!row.segment) row.segment = segment;
      if (fn.rom > row.offset) row.edges.push((fn.rom - row.offset) / BYTES_PER_ROW);
    }
    segment.count += 1;
    segment.end = Math.max(segment.end, fn.rom + fn.size);
  });
  for (const fn of fns) {
    delete fn.row;
    delete fn.lastRow;
  }
  return { fns, rows };
}

export function legend() {
  const steps = Array.from({ length: 11 }, (_, i) => `<i class="q${i}"></i>`).join('');
  return `<p class="legend"><span>asm</span><span class="steps">${steps}</span><span>exact</span></p>`;
}

// ROM memory map: one row per 16 KiB, each function a slice as wide as its bytes, naming its function's index.
export function mapHtml({ rows }) {
  const lines = rows
    .map((row) => {
      const label = row.segment ? `<div class="seg">${hex(row.segment.start)}–${hex(row.segment.end)} · ${n(row.segment.count)} fn</div>` : '';
      const edges = row.edges.map((at) => `<b class="edge" style="left:${share(at)}"></b>`).join('');
      const slices = row.slices
        .map(({ f, q, left, width }) => `<i class="q${q}${width >= SEPARATED ? ' s' : ''}" data-f="${f}" style="left:${share(left)};width:${share(width)}"></i>`)
        .join('');
      return `${label}<div class="row"><span class="off">${hex(row.offset)}</span><span class="track">${edges}${slices}</span></div>`;
    })
    .join('\n');
  return `<div class="map" aria-label="memory map: arrow keys move between functions, enter or a tap opens its details">${lines}<b class="cross" hidden></b></div>`;
}

// The compact per-function data the map script reads: [name, file index or -1, percent, size, ROM offset, line].
export function mapData(model, repo) {
  const units = [...new Set(model.fns.map((fn) => fn.path).filter(Boolean))];
  const index = new Map(units.map((unit, i) => [unit, i]));
  return {
    repo,
    units,
    fns: model.fns.map((fn) => [fn.name, fn.path ? index.get(fn.path) : -1, fn.percent, fn.size, fn.rom, fn.line || 0]),
  };
}

export function figureInner(model, repo) {
  return `<p class="readout" hidden></p>
<script type="application/json" class="map-data">${JSON.stringify(mapData(model, repo)).replace(/</g, '\\u003c')}</script>
${mapHtml(model)}${legend()}`;
}
