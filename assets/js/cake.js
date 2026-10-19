// Cake unbake data and markup for the page script, which fetches each repo's published progress.json from main on every
// visit. Pure: no DOM, no fetch, so the tests run it in node.
//   progress.json   {schema:2, carts:[{id, version, rom_size, code:{matched,fuzzy,total}, data:{matched,fuzzy,total},
//                     functions:{matched,fuzzy,total}, blobs:{decoded,identified,total,by_type}, platform, unknown}],
//                    map:{version, rom_size, fns:[[name, rom, size, percent, path, line]],
//                         blobs:[[id, rom, size, state, type]], spans:{data:[[from,to]], platform:[[from,to]]}}}
//                   Every byte of the ROM is one of code, data, platform, blobs or unknown: their sum is rom_size. `map` is
//                   only for the version the page shows. percent: fuzzy percent 0..100. Blobs in state `observed` are
//                   not drawn, their bytes are unknown. Anything but schema 2 is rejected.
//   <path>          the C file at main; a function's source is its text from `line` to its closing brace

export const BYTES_PER_ROW = 16384;
const SEPARATED = 0.006;

// The five layers of a ROM, in the order the checkboxes and the key list them. All start shown.
export const LAYERS = ['code', 'data', 'blobs', 'platform', 'unknown'];

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
  return { matched: whole(row.matched, `${what}.matched`), fuzzy: whole(row.fuzzy, `${what}.fuzzy`), total: whole(row.total, `${what}.total`) };
};

// The carts of progress.json by version code, checked, for the versions the page lists. The ROM's bytes must add up:
// code + data + platform + blobs + unknown = rom_size, and blobs = decoded + identified.
export function parseProgress(progress, versions) {
  if (!progress || progress.schema !== 2 || !Array.isArray(progress.carts)) throw new TypeError('progress.json is not schema 2');
  const byVersion = new Map();
  for (const cart of progress.carts) {
    const code = bucket(cart.code, 'code');
    const data = bucket(cart.data, 'data');
    const functions = bucket(cart.functions, 'functions');
    const blobs = cart.blobs || {};
    const decoded = whole(blobs.decoded, 'blobs.decoded');
    const identified = whole(blobs.identified, 'blobs.identified');
    const total = whole(blobs.total, 'blobs.total');
    const platform = whole(cart.platform, 'platform');
    const unknown = whole(cart.unknown, 'unknown');
    const romSize = whole(cart.rom_size, 'rom_size');
    if (decoded + identified !== total) throw new TypeError(`progress.json: ${cart.version} blobs decoded + identified is not total`);
    if (code.total + data.total + platform + total + unknown !== romSize) throw new TypeError(`progress.json: ${cart.version} bytes do not add up to rom_size`);
    byVersion.set(cart.version, {
      version: String(cart.version),
      id: String(cart.id),
      revision: Number((/-(\d+)$/.exec(cart.id) || [0, 0])[1]),
      fn: functions.matched,
      fnTotal: functions.total,
      text: code.total ? (code.matched / code.total) * 100 : 0,
      code,
      data,
      blobs: { decoded, identified, total, types: blobs.by_type && typeof blobs.by_type === 'object' ? blobs.by_type : {} },
      platform,
      unknown,
      romSize,
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

// The blob census as one line: blobs per type, every state counted ("texture 4 · sound 2").
export function blobTypes(types) {
  return Object.entries(types)
    .map(([type, states]) => `${type} ${n(Object.values(states).reduce((a, b) => a + b, 0))}`)
    .join(' · ');
}

export function specRows(cart, versions) {
  const census = blobTypes(cart.blobs.types);
  return [
    ['cartridge', cart.id],
    ['region', regionCode(cart.version)],
    ['revision', String(cart.revision)],
    ['versions', versions.join(', ')],
    ['matched fn', `${n(cart.fn)} / ${n(cart.fnTotal)}`],
    ['% .text', `${cart.text.toFixed(2)} %`],
    ['code bytes', `${n(cart.code.matched)} / ${n(cart.code.total)} B`],
    ['fuzzy bytes', `${n(cart.code.fuzzy)} B`],
    ['data bytes', `${n(cart.data.matched)} / ${n(cart.data.total)} B`],
    ['blobs bytes', `${n(cart.blobs.decoded)} decoded + ${n(cart.blobs.identified)} identified B`],
    ...(census ? [['blob types', census]] : []),
    ['platform bytes', `${n(cart.platform)} B`],
    ['unknown bytes', `${n(cart.unknown)} B`],
    ['rom', `${n(cart.romSize)} B`],
  ];
}

export function specHtml(cart, versions, repo) {
  const rows = specRows(cart, versions).map(([k, v]) => `<div><dt>${k}</dt><dd>${e(v)}</dd></div>`).join('');
  return `<dl class="spec">${rows}<div><a href="https://github.com/${e(repo)}">source</a></div></dl>`;
}

// One line per ROM version: version code, cartridge (its code carries region and revision) and the counts. Fuzzy, platform and
// the blob decoded/identified split are on the spec rows; blobs B here is decoded of all blob bytes.
// data-label is the short label a narrow column shows beside each value once the header row is hidden.
export function versionTable(carts) {
  const cell = (label, value) => `<td data-label="${label}">${value}</td>`;
  const body = carts
    .map((c) => `<tr><td>${e(c.version)}</td><td>${e(c.id)}</td>${[
      cell('fn', `${n(c.fn)}/${n(c.fnTotal)}`),
      cell('.text', pct(c.text)),
      cell('code B', `${n(c.code.matched)}/${n(c.code.total)}`),
      cell('data B', `${n(c.data.matched)}/${n(c.data.total)}`),
      cell('blobs B', `${n(c.blobs.decoded)}/${n(c.blobs.total)}`),
      cell('unknown B', n(c.unknown)),
    ].join('')}</tr>`)
    .join('\n');
  return `<div class="versions"><table class="table">
<thead><tr><th>version</th><th>cartridge</th><th>matched fn</th><th>% .text</th><th>code B</th><th>data B</th><th>blobs B</th><th>unknown B</th></tr></thead>
<tbody>
${body}
</tbody>
</table></div>`;
}

// What wins a byte several rows claim: code, data, platform, decoded blobs, identified blobs; then unknown.
const RANK = { code: 0, data: 1, platform: 2, decoded: 3, identified: 4 };
const LAYER_OF = { code: 'code', data: 'data', platform: 'platform', blobs: 'blobs' };

function span(rows, what, romSize) {
  if (!Array.isArray(rows)) throw new TypeError(`progress.json: map.${what} is not a list`);
  return rows.map((row) => {
    const [from, to] = row;
    if (whole(from, `map.${what} start`) > whole(to, `map.${what} end`) || to > romSize) throw new TypeError(`progress.json: map.${what} range is outside the ROM`);
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

// The memory map of progress.json's `map` as items in ROM order (every function, data span, platform span and blob) and
// rows of 16 KiB with the pieces each shows. Items that another item outranks keep only the bytes they win; observed
// blobs are left out (their bytes are unknown).
export function parseMap(map) {
  if (!map || typeof map !== 'object') throw new TypeError('progress.json has no map');
  const romSize = whole(map.rom_size, 'map.rom_size');
  if (!romSize || !Array.isArray(map.fns) || !Array.isArray(map.blobs) || !map.spans) throw new TypeError('progress.json: map is malformed');
  const items = [];
  for (const row of map.fns) {
    const [name, rom, size, percent, path, line] = row;
    if (typeof name !== 'string' || typeof percent !== 'number' || !(percent >= 0 && percent <= 100)) throw new TypeError(`progress.json: map function ${name}`);
    if (whole(rom, `map ${name} rom`) + whole(size, `map ${name} size`) > romSize) throw new TypeError(`progress.json: map function ${name} is outside the ROM`);
    items.push({ kind: 'code', rank: 'code', name, rom, size, percent, path: path || null, line: path ? line || 0 : null });
  }
  for (const row of map.blobs) {
    const [id, rom, size, stateName, type] = row;
    if (!['decoded', 'identified', 'observed'].includes(stateName)) throw new TypeError(`progress.json: map blob ${id} state`);
    if (whole(rom, `map ${id} rom`) + whole(size, `map ${id} size`) > romSize) throw new TypeError(`progress.json: map blob ${id} is outside the ROM`);
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

// The layers to show from the stored text; anything unreadable shows all five.
export function parseLayers(text) {
  try {
    const list = JSON.parse(text);
    if (Array.isArray(list) && list.every((name) => LAYERS.includes(name))) return new Set(list);
  } catch {
    // Not stored yet, or not JSON: the default below.
  }
  return new Set(LAYERS);
}

// The key: one checkbox per layer, one scale of match for code (0 % left, 100 % right) and the blob shades.
export function legend(shown = new Set(LAYERS)) {
  const boxes = LAYERS.map((name) => `<label><input type="checkbox" data-layer="${name}"${shown.has(name) ? ' checked' : ''}> ${name}</label>`).join('');
  return `<div class="legend"><div class="layers">${boxes}</div><div class="scale"><i class="none"></i><i class="fuzzy"></i><i class="exact"></i><span>0 %</span><span>100 %</span></div><div class="key"><span><i class="blob identified"></i>identified</span><span><i class="blob decoded"></i>decoded</span></div></div>`;
}

const layerOf = (model, f) => (f < 0 ? 'unknown' : LAYER_OF[model.items[f].kind]);

// ROM memory map: one row per 16 KiB, each piece a slice as wide as its bytes. Code is colored by its state (exact, none,
// or a ramp for fuzzy), data, platform and blobs by their own colors, unknown is the empty track. Only the shown layers
// are drawn and a row with nothing to draw is dropped.
export function mapHtml(model, shown = new Set(LAYERS)) {
  const { items, rows } = model;
  const lines = rows
    .map((row) => {
      const slices = row.slices
        .filter(({ f }) => shown.has(layerOf(model, f)))
        .map(({ f, left, width }) => {
          const place = `left:${share(left)};width:${share(width)}`;
          const sep = width >= SEPARATED ? ' s' : '';
          if (f < 0) return `<i class="unknown${sep}" style="${place}"></i>`;
          const item = items[f];
          if (item.kind === 'code') {
            const kind = state(item.percent);
            return `<i class="${kind}${sep}" data-f="${f}" style="${place}${kind === 'fuzzy' ? `;--p:${item.percent}%` : ''}"></i>`;
          }
          return `<i class="${item.kind === 'blobs' ? `blob ${item.state}` : item.kind}${sep}" data-f="${f}" style="${place}"></i>`;
        });
      return slices.length ? `<div class="row"><span class="off">${hex(row.offset)}</span><span class="track">${slices.join('')}</span></div>` : '';
    })
    .filter(Boolean)
    .join('\n');
  return `<div class="map" aria-label="memory map: arrow keys move between pieces, enter or a tap opens its details">${lines}<b class="cross" hidden></b></div>`;
}

// The compact per-item data the map script reads: [name, file index or -1, percent or null, size, ROM offset, line, words or null,
// kind, blob [state, type] or null].
export function mapData(model, repo) {
  const units = [...new Set(model.items.map((item) => item.path).filter(Boolean))];
  const index = new Map(units.map((unit, i) => [unit, i]));
  return {
    repo,
    units,
    fns: model.items.map((item) => [item.name, item.path ? index.get(item.path) : -1, item.kind === 'code' ? item.percent : null, item.size, item.rom, item.line || 0, null, item.kind, item.kind === 'blobs' ? [item.state, item.type] : null]),
  };
}

export function figureInner(model, repo, shown = new Set(LAYERS)) {
  return `<p class="readout" hidden></p>
<script type="application/json" class="map-data">${JSON.stringify(mapData(model, repo)).replace(/</g, '\\u003c')}</script>
${mapHtml(model, shown)}${legend(shown)}`;
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
