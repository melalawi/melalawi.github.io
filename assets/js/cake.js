// Cake unbake data and markup for the page script, which fetches each repo's published files from main on every
// visit. Pure: no DOM, no fetch, so the tests run it in node.
//   progress.json                {schema:1, carts:[{id, version, functions:{matched,total}, text_pct, bytes:{matched,fuzzy,asm,total}}]}
//   docs/memory-map-<v>.svg      one <g> per 16 KiB ROM row; each <rect class="qN"> a function slice titled "name · P% · S B"
//   versions/<v>/symbols.json    {schema:2, functions:{name:{path, line, percent, words:[matched,total], summary?}}}; asm-only
//                                functions are absent. percent: fuzzy percent 0..100. summary: one plain sentence on what the
//                                function does; absent until written. Schema 1 (no percent, words) is read until the repos
//                                publish schema 2, taking the percent from the map slice title; drop that path one release after.
//   <path>                       the C file at main; a function's source is its text from `line` to its closing brace

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
  if (!symbols || ![1, 2].includes(symbols.schema) || typeof symbols.functions !== 'object') throw new TypeError('symbols.json is not schema 1 or 2');
  const groups = [...svg.matchAll(/<g transform="translate\(0 [\d.]+\)"><text[^>]*>([0-9A-Fa-f]+)<\/text>([\s\S]*?)<\/g>/g)];
  if (!groups.length) throw new TypeError('memory map has no rows');
  const parsed = groups.map(([, offset, body]) => ({
    offset: parseInt(offset, 16),
    rects: [...body.matchAll(/<rect class="q\d+" x="([\d.]+)" width="([\d.]+)"[^>]*><title>([^<]*)<\/title><\/rect>/g)].map((m) => ({
      x: Number(m[1]),
      w: Number(m[2]),
      title: unescape(m[3]),
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
        last = { name: t[1], percent: symbol && typeof symbol.percent === 'number' ? symbol.percent : Number(t[2]), size: Number(t[3]), rom: from, path: symbol ? symbol.path : null, line: symbol ? symbol.line : null, words: symbol && symbol.words ? symbol.words : null, row: rows.length };
        fns.push(last);
        f = fns.length - 1;
      }
      fns[f].lastRow = rows.length;
      end = from + Math.round((r.w / width) * BYTES_PER_ROW);
      slices.push({ f, left: (r.x - left) / width, width: r.w / width });
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

// A function's state on the map: exact at 100 %, none at 0 %, fuzzy in between.
export function state(percent) {
  return percent >= 100 ? 'exact' : percent > 0 ? 'fuzzy' : 'none';
}

export function legend() {
  return '<p class="legend"><i class="swatch exact"></i><span>exact</span><span class="ramp"></span><span>fuzzy 0 to 100 %</span><i class="swatch none"></i><span>none</span></p>';
}

// ROM memory map: one row per 16 KiB, each function a slice as wide as its bytes, colored by its state: exact, none, or a ramp for fuzzy.
export function mapHtml({ rows, fns }) {
  const lines = rows
    .map((row) => {
      const label = row.segment ? `<div class="seg">${hex(row.segment.start)}–${hex(row.segment.end)} · ${n(row.segment.count)} fn</div>` : '';
      const edges = row.edges.map((at) => `<b class="edge" style="left:${share(at)}"></b>`).join('');
      const slices = row.slices
        .map(({ f, left, width }) => {
          const { percent } = fns[f];
          const kind = state(percent);
          return `<i class="${kind}${width >= SEPARATED ? ' s' : ''}" data-f="${f}" style="left:${share(left)};width:${share(width)}${kind === 'fuzzy' ? `;--p:${percent}%` : ''}"></i>`;
        })
        .join('');
      return `${label}<div class="row"><span class="off">${hex(row.offset)}</span><span class="track">${edges}${slices}</span></div>`;
    })
    .join('\n');
  return `<div class="map" aria-label="memory map: arrow keys move between functions, enter or a tap opens its details">${lines}<b class="cross" hidden></b></div>`;
}

// The compact per-function data the map script reads: [name, file index or -1, percent, size, ROM offset, line, words or null].
export function mapData(model, repo) {
  const units = [...new Set(model.fns.map((fn) => fn.path).filter(Boolean))];
  const index = new Map(units.map((unit, i) => [unit, i]));
  return {
    repo,
    units,
    fns: model.fns.map((fn) => [fn.name, fn.path ? index.get(fn.path) : -1, fn.percent, fn.size, fn.rom, fn.line || 0, fn.words]),
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
