// Cake unbake data and markup for the page script, which fetches each repo's published progress.json from main on every
// visit. Pure: no DOM, no fetch, so the tests run it in node.
//   progress.json   {schema:2, carts:[{id, version, rom_size, code:{matched,total}, data:{matched,total},
//                     blobs:{decoded,total}, header:{bytes, pi:{release,page_size,pulse_width,latency}, clock_rate,
//                     entry_point, release, crc1, crc2, name, game_id, country, version}, functions:{matched,total}}]}
//                   The parts (header block, code, data, blobs) never add up to more than rom_size; what they leave is
//                   simply not covered. `header` is the header block's byte count (cartridge header and boot code)
//                   and the parsed cartridge header fields, never bytes.
//   docs/map-<version>.json   {schema:1, version, rom_size, fns:[[name, rom, size, percent, path, line]],
//                   blobs:[[id, rom, size, state, type]], spans:{data:[[from,to]], platform:[[from,to]]}}
//                   one per version, fetched when its tab is first shown.
//                   percent: fuzzy percent 0..100. Blobs in state `observed` are
//                   not drawn, their bytes are unknown. Anything but schema 2 is rejected.
//   <path>          the C file at main; a function's source is its text from `line` to its closing brace

export const BYTES_PER_ROW = 16384;
const SEPARATED = 0.006;

export function rawUrl(repo, path) {
  return `https://raw.githubusercontent.com/${repo}/main/${path}`;
}

export function sourceUrls(repo) {
  return { progress: rawUrl(repo, 'progress.json') };
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
const bucket = (row, what) => {
  if (!row || typeof row !== 'object') throw new TypeError(`progress.json: ${what} is missing`);
  return { matched: whole(row.matched, `${what}.matched`), total: whole(row.total, `${what}.total`) };
};

// The carts of progress.json by version code, checked, for the versions the page lists. The ROM's parts must fit in it:
// header block + code + data + blobs never exceed rom_size, and decoded blobs never exceed their total.
export function parseProgress(progress, versions) {
  if (!progress || progress.schema !== 2 || !Array.isArray(progress.carts)) throw new TypeError('progress.json is not schema 2');
  const byVersion = new Map();
  for (const cart of progress.carts) {
    const code = bucket(cart.code, 'code');
    const data = bucket(cart.data, 'data');
    const functions = bucket(cart.functions, 'functions');
    const blobs = cart.blobs || {};
    const decoded = whole(blobs.decoded, 'blobs.decoded');
    const total = whole(blobs.total, 'blobs.total');
    const romSize = whole(cart.rom_size, 'rom_size');
    const head = header(cart.header, cart.version);
    if (decoded > total) throw new TypeError(`progress.json: ${cart.version} blobs decoded is over total`);
    if (code.total + data.total + total + head.bytes > romSize) throw new TypeError(`progress.json: ${cart.version} parts are over rom_size`);
    byVersion.set(cart.version, {
      version: String(cart.version),
      id: String(cart.id),
      romSize,
      code,
      data,
      blobs: { decoded, total },
      header: head,
      functions,
    });
  }
  return versions.map((version) => {
    if (!byVersion.has(version)) throw new Error(`progress.json has no cart for ${version}`);
    return byVersion.get(version);
  });
}

// The header fields of a cart, checked: integers in range and strings, nothing else used.
function header(row, version) {
  const what = `${version} header`;
  if (!row || typeof row !== 'object' || !row.pi || typeof row.pi !== 'object') throw new TypeError(`progress.json: ${what} is malformed`);
  const u32 = (value, field) => {
    if (whole(value, `${what}.${field}`) > 0xffffffff) throw new TypeError(`progress.json: ${what}.${field} is not 32 bits`);
    return value;
  };
  const text = (value, field) => {
    if (typeof value !== 'string') throw new TypeError(`progress.json: ${what}.${field} is not text`);
    return value;
  };
  return {
    bytes: whole(row.bytes, `${what}.bytes`),
    pi: { release: whole(row.pi.release, `${what}.pi.release`), page_size: whole(row.pi.page_size, `${what}.pi.page_size`), pulse_width: whole(row.pi.pulse_width, `${what}.pi.pulse_width`), latency: whole(row.pi.latency, `${what}.pi.latency`) },
    clock_rate: u32(row.clock_rate, 'clock_rate'),
    entry_point: u32(row.entry_point, 'entry_point'),
    release: text(row.release, 'release'),
    crc1: u32(row.crc1, 'crc1'),
    crc2: u32(row.crc2, 'crc2'),
    name: text(row.name, 'name'),
    game_id: text(row.game_id, 'game_id'),
    country: text(row.country, 'country'),
    version: whole(row.version, `${what}.version`),
  };
}

// The numbers of one version: the ROM first (everything matched, decoded or the header block, of its size), its parts
// under it (depth 1, the last one marked) and then the functions. What the parts do not cover is not a row.
export function specRows(cart) {
  const bytes = (value) => `${n(value)} bytes`;
  const of = (matched, total) => `${n(matched)} / ${bytes(total)}`;
  const sure = cart.code.matched + cart.data.matched + cart.blobs.decoded + cart.header.bytes;
  return [
    ['rom', of(sure, cart.romSize), 0],
    ['header', bytes(cart.header.bytes), 1],
    ['code', of(cart.code.matched, cart.code.total), 1],
    ['data', of(cart.data.matched, cart.data.total), 1],
    ['blobs', of(cart.blobs.decoded, cart.blobs.total), 2],
    ['functions', `${n(cart.functions.matched)} / ${n(cart.functions.total)}`, 0],
  ];
}

export function specHtml(cart) {
  const rows = specRows(cart).map(([k, v, depth]) => `<div${depth ? ` class="branch${depth > 1 ? ' last' : ''}"` : ''}><dt>${k}</dt><dd>${e(v)}</dd></div>`).join('');
  return `<dl class="spec">${rows}</dl>`;
}

// The anchor of one repo's version on the page: `<repo name>-<version>`, lower case (ragewars-decomp-us-rev1). The game
// READMEs link their map image to /attic/cake-unbake/#<anchor>.
export function anchorId(repo, version) {
  return `${repo.split('/').pop()}-${version}`.toLowerCase();
}

// The version of `repo` that a location hash names, else null.
export function versionFromHash(hash, repo, versions) {
  let wanted;
  try {
    wanted = decodeURIComponent(hash.replace(/^#/, '')).toLowerCase();
  } catch {
    return null;
  }
  return versions.find((version) => anchorId(repo, version) === wanted) || null;
}

// One tab per version, labelled by its cartridge ID with the version code under it; `selected` is the version shown.
// Roving tabindex: only the selected tab is in the tab order, the arrow keys move between tabs.
export function tabsHtml(carts, selected, key) {
  const tabs = carts
    .map((c) => {
      const on = c.version === selected;
      return `<button type="button" role="tab" class="tab" id="tab-${e(key)}-${e(c.version)}" data-version="${e(c.version)}" aria-selected="${on}" aria-controls="panel-${e(key)}" tabindex="${on ? 0 : -1}"><span class="tab-id">${e(c.id)}</span><span class="tab-v">${e(c.version)}</span></button>`;
    })
    .join('');
  return `<div class="tabs" role="tablist" aria-label="rom version">${tabs}</div>`;
}

// The ROM breakdown: the header block at offset 0 (cartridge header and boot code, a button that opens the header's
// fields), then code, data and blobs, each as wide as its share of the ROM. What they do not cover is the empty rest.
export const PARTS = [
  ['code', (c) => c.code.total],
  ['data', (c) => c.data.total],
  ['blobs', (c) => c.blobs.total],
];

// A part's share of the ROM to one decimal; a part too small to show one is "< 0.1 %".
export function percentOf(size, total) {
  const value = (size / total) * 100;
  return value > 0 && value < 0.05 ? '< 0.1 %' : `${value.toFixed(1)} %`;
}

export function breakdownHtml(cart) {
  const parts = PARTS.map(([name, size]) => [name, size(cart)]).filter(([, size]) => size > 0);
  const bar = parts.map(([name, size]) => `<i class="part-${name}" style="width:${share(size / cart.romSize)}" title="${name} ${n(size)} bytes"></i>`).join('');
  const key = parts.map(([name, size]) => `<span><i class="part-${name}"></i>${name} <b>${percentOf(size, cart.romSize)}</b></span>`).join('');
  const head = '<button type="button" class="header-block" aria-haspopup="dialog" title="rom header: open its fields">header</button>';
  return `<div class="breakdown"><div class="bar">${head}<span class="parts">${bar}</span></div><p class="parts-key">${key}</p></div>`;
}

const hex8 = (value) => hex(value, 8);
const hex2 = (value) => hex(value, 2);

// The parsed cartridge header fields of progress.json as dialog rows. Fields only: the page never sees header bytes.
export function headerRows(header) {
  const { pi } = header;
  return [
    ['size', `${n(header.bytes)} bytes with the boot code`],
    ['internal name', header.name],
    ['game id', header.game_id],
    ['country', header.country],
    ['version', String(header.version)],
    ['release', header.release ? `libultra ${header.release}` : 'unknown'],
    ['entry point', hex8(header.entry_point)],
    ['clock rate', hex8(header.clock_rate)],
    ['pi settings', `latency ${hex2(pi.latency)} · pulse width ${hex2(pi.pulse_width)} · page size ${pi.page_size} · release ${pi.release}`],
    ['crc1', hex8(header.crc1)],
    ['crc2', hex8(header.crc2)],
  ];
}

// The published map file of one version.
export function mapUrl(repo, version) {
  return rawUrl(repo, `docs/map-${version}.json`);
}

// What wins a byte several rows claim: code, data, platform, decoded blobs, identified blobs; then unknown.
const RANK = { code: 0, data: 1, platform: 2, decoded: 3, identified: 4 };

function span(rows, what, romSize) {
  if (!Array.isArray(rows)) throw new TypeError(`map file: map.${what} is not a list`);
  return rows.map((row) => {
    const [from, to] = row;
    if (whole(from, `map.${what} start`) > whole(to, `map.${what} end`) || to > romSize) throw new TypeError(`map file: map.${what} range is outside the ROM`);
    return { from, to };
  });
}

// Every byte of [0, romSize) once, as pieces {from, to, f}: f the index of the item that wins the byte, -1 for unknown.
// Adjacent pieces of one item (or both unknown) are joined.
function tile(items, romSize) {
  const points = new Set([0, romSize]);
  for (const item of items) {
    points.add(item.rom);
    points.add(item.rom + item.size);
  }
  const edges = [...points].sort((a, b) => a - b);
  const order = items.map((item, f) => f).sort((a, b) => items[a].rom - items[b].rom);
  const pieces = [];
  let next = 0;
  let active = [];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    const from = edges[i];
    const to = edges[i + 1];
    while (next < order.length && items[order[next]].rom <= from) active.push(order[next++]);
    active = active.filter((f) => items[f].rom + items[f].size > from);
    let best = -1;
    for (const f of active) if (best < 0 || RANK[items[f].rank] < RANK[items[best].rank]) best = f;
    const last = pieces[pieces.length - 1];
    if (last && last.f === best && last.to === from) last.to = to;
    else pieces.push({ from, to, f: best });
  }
  return pieces;
}

// The memory map of a version's map file as items in ROM order (every function, data span, platform span and blob) and
// rows of 16 KiB with the pieces each shows. Items that another item outranks keep only the bytes they win; observed
// blobs are left out (their bytes are unknown).
export function parseMap(map) {
  if (!map || typeof map !== 'object' || map.schema !== 1) throw new TypeError('map is not schema 1');
  const romSize = whole(map.rom_size, 'map.rom_size');
  if (!romSize || !Array.isArray(map.fns) || !Array.isArray(map.blobs) || !map.spans) throw new TypeError('map file: map is malformed');
  const items = [];
  for (const row of map.fns) {
    const [name, rom, size, percent, path, line] = row;
    if (typeof name !== 'string' || typeof percent !== 'number' || !(percent >= 0 && percent <= 100)) throw new TypeError(`map file: map function ${name}`);
    if (whole(rom, `map ${name} rom`) + whole(size, `map ${name} size`) > romSize) throw new TypeError(`map file: map function ${name} is outside the ROM`);
    items.push({ kind: 'code', rank: 'code', name, rom, size, percent, path: path || null, line: path ? line || 0 : null });
  }
  for (const row of map.blobs) {
    const [id, rom, size, stateName, type] = row;
    if (!['decoded', 'identified', 'observed'].includes(stateName)) throw new TypeError(`map file: map blob ${id} state`);
    if (whole(rom, `map ${id} rom`) + whole(size, `map ${id} size`) > romSize) throw new TypeError(`map file: map blob ${id} is outside the ROM`);
    if (stateName === 'observed') continue;
    items.push({ kind: 'blobs', rank: stateName, name: String(id), rom, size, state: stateName, type: String(type) });
  }
  for (const kind of ['data', 'platform']) {
    for (const { from, to } of span(map.spans[kind], `spans.${kind}`, romSize)) {
      items.push({ kind, rank: kind, name: kind, rom: from, size: to - from });
    }
  }
  items.sort((a, b) => a.rom - b.rom || RANK[a.rank] - RANK[b.rank]);
  const rows = Array.from({ length: Math.ceil(romSize / BYTES_PER_ROW) }, (x, i) => ({ offset: i * BYTES_PER_ROW, slices: [] }));
  for (const piece of tile(items, romSize)) {
    for (let at = piece.from; at < piece.to; ) {
      const row = rows[Math.floor(at / BYTES_PER_ROW)];
      const end = Math.min(piece.to, row.offset + BYTES_PER_ROW);
      row.slices.push({ f: piece.f, left: (at - row.offset) / BYTES_PER_ROW, width: (end - at) / BYTES_PER_ROW });
      at = end;
    }
  }
  return { items, rows, romSize };
}

// A function's state on the map: exact at 100 %, none at 0 %, fuzzy in between.
export function state(percent) {
  return percent >= 100 ? 'exact' : percent > 0 ? 'fuzzy' : 'none';
}

// The key: one scale of match for code, 0 % at the left end and 100 % at the right.
export function legend() {
  return '<div class="legend"><div class="scale"><i class="none"></i><i class="fuzzy"></i><i class="exact"></i><span>0 %</span><span>100 %</span></div></div>';
}

// ROM memory map: one row per 16 KiB, each function a slice as wide as its bytes, colored by its state: exact, none, or a
// ramp for fuzzy. Only code is drawn; data, platform, blobs and unknown bytes stay off the map, and a row without code is dropped.
export function mapHtml(model) {
  const { items, rows } = model;
  const lines = rows
    .map((row) => {
      const slices = row.slices
        .filter(({ f }) => f >= 0 && items[f].kind === 'code')
        .map(({ f, left, width }) => {
          const { percent } = items[f];
          const kind = state(percent);
          return `<i class="${kind}${width >= SEPARATED ? ' s' : ''}" data-f="${f}" style="left:${share(left)};width:${share(width)}${kind === 'fuzzy' ? `;--p:${percent}%` : ''}"></i>`;
        });
      return slices.length ? `<div class="row"><span class="off">${hex(row.offset)}</span><span class="track">${slices.join('')}</span></div>` : '';
    })
    .filter(Boolean)
    .join('\n');
  return `<div class="map" aria-label="memory map: arrow keys move between functions, enter or a tap opens its details">${lines}<b class="cross" hidden></b></div>`;
}

// The compact per-function data the map script reads: [name, file index or -1, percent, size, ROM offset, line, words or null].
export function mapData(model, repo) {
  const units = [...new Set(model.items.map((item) => item.path).filter(Boolean))];
  const index = new Map(units.map((unit, i) => [unit, i]));
  return {
    repo,
    units,
    fns: model.items.map((item) => [item.name, item.path ? index.get(item.path) : -1, item.kind === 'code' ? item.percent : null, item.size, item.rom, item.line || 0, null]),
  };
}

export function figureInner(model, repo) {
  return `<p class="readout" hidden></p>
<script type="application/json" class="map-data">${JSON.stringify(mapData(model, repo)).replace(/</g, '\\u003c')}</script>
${mapHtml(model)}${legend()}`;
}

export function sourceUrl(repo, path, line) {
  return `https://github.com/${repo}/blob/main/${path}#L${line}`;
}

const BRACES = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[{}]/g;

// The function that starts at 1-based `line` of a C file: that line to the line of the brace closing its body.
// Braces in comments and literals do not count. Null when the line is out of range or the body never closes.
export function functionLines(source, line) {
  const all = source.split('\n');
  if (!Number.isInteger(line) || line < 1 || line > all.length) return null;
  const text = all.slice(line - 1).join('\n');
  let depth = 0;
  for (const m of text.matchAll(BRACES)) {
    if (m[0] === '{') depth += 1;
    else if (m[0] === '}' && (depth -= 1) <= 0) return text.slice(0, m.index + 1);
  }
  return null;
}

const KEYWORDS = new Set('if else for while do switch case default break continue return goto sizeof typedef struct union enum static extern const volatile void char short int long float double unsigned signed register inline u8 s8 u16 s16 u32 s32 u64 s64 f32 f64 NULL'.split(' '));
const C_TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(^[ \t]*#[^\n]*)|(\b(?:0x[0-9A-Fa-f]+|\d[\d.]*)[fFuUlL]*\b)|(\b[A-Za-z_]\w*\b)/gm;

// C source as HTML with comments, strings, preprocessor lines, numbers and keywords wrapped in spans.
export function highlightC(code) {
  let out = '';
  let at = 0;
  for (const m of code.matchAll(C_TOKEN)) {
    const kind = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'p' : m[4] ? 'n' : KEYWORDS.has(m[5]) ? 'k' : null;
    out += e(code.slice(at, m.index));
    out += kind ? `<span class="t${kind}">${e(m[0])}</span>` : e(m[0]);
    at = m.index + m[0].length;
  }
  return out + e(code.slice(at));
}

// The modal body below the facts: what the function does and its C. Both parts are optional.
export function detailHtml({ summary, code }) {
  const what = typeof summary === 'string' && summary ? `<p class="fn-what">${e(summary)}</p>` : '';
  const c = code ? `<section class="fn-c"><h3>c</h3><pre>${highlightC(code)}</pre></section>` : '';
  return what + c;
}
