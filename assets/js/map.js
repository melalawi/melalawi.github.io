// Cake unbake: the built page has no numbers. Each ROM section reads its repo's progress.json (schema 2: the numbers and
// the cartridge header fields per version) from main on every visit. A tab per version picks the one shown (the site's
// default first): its ROM breakdown, whose parts each open their own rows, its numbers and its memory map, read
// from that version's docs/map-<version>.json once the figure nears the screen and then kept for the visit. The last good copy is
// kept in this browser and drawn first, so a failed or malformed fetch keeps the last numbers on screen; with no copy
// yet the section says the numbers are unavailable.  Only code is drawn on the map.
// ROM memory map: hover or keyboard focus shows one function in the readout, lights the other functions of its
// source file and marks its row and column. A click, tap or Enter opens a dialog with the same facts, steps to
// the neighbouring functions, shows what the function does and its C, and
// links its source line on GitHub. A tap between slices or on a row's offset
// picks the nearest slice in the nearest row, so the thinnest functions are reachable on a phone.
import { anchorId, versionFromHash, breakdownHtml, detailHtml, figureInner, functionLines, partRows, mapUrl, parseMap, parseProgress, rawUrl, sourceUrl, sourceUrls, specHtml, tabsHtml } from './cake.js';

const steppers = new Map();
const fnDialog = document.getElementById('fn');
if (fnDialog) {
  fnDialog.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step]');
    const step = button && steppers.get(fnDialog.dataset.map);
    if (step) step(Number(button.dataset.step));
  });
}

const stored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the live copy still shows, only the fallback is lost.
  }
};

async function fetched(url) {
  const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

// Draw the stored copy, then the live one; a live copy that draws is stored. Resolves to how it ended:
// live, kept (stored copy on screen, live failed) or none (nothing to show).
async function source(key, load, draw) {
  let shown = false;
  const old = stored(key);
  if (old) {
    try {
      draw(old);
      shown = true;
    } catch {
      // A stored copy this script can no longer read is ignored.
    }
  }
  try {
    const text = await load();
    draw(text);
    store(key, text);
    return 'live';
  } catch {
    return shown ? 'kept' : 'none';
  }
}

const unavailable = (box, repo) => {
  box.innerHTML = `<p class="status">unavailable right now · <a href="https://github.com/${repo}">source</a></p>`;
};

// Per section: the checked carts of the progress.json on screen, and whether its figure has neared the screen.
const docs = new Map();
const partDialog = document.getElementById('rom-part');

async function numbers(section) {
  const { repo } = section.dataset;
  const versions = section.dataset.versions.split(' ');
  const box = section.querySelector('.numbers');
  const end = await source(`cake:${repo}:progress`, () => fetched(sourceUrls(repo).progress), (text) => {
    const document_ = JSON.parse(text);
    const carts = parseProgress(document_, versions);
    docs.set(section, { carts });
    render(section);
  });
  if (end === 'none') unavailable(box, repo);
  return end;
}

// The selected version's tabs, breakdown and spec rows, then its map once the figure was near the screen.
function render(section) {
  const { repo, version, key } = section.dataset;
  const { carts } = docs.get(section);
  const cart = carts.find((c) => c.version === version);
  const slot = section.querySelector('.tabs-slot');
  const panel = section.querySelector('.panel');
  panel.id = `panel-${key}`;
  if (carts.length > 1) {
    slot.innerHTML = tabsHtml(carts, version, key);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${key}-${version}`);
    // A narrow row scrolls sideways: bring the selected tab into it without scrolling the page.
    const row = slot.firstElementChild;
    const tab = row.querySelector('[aria-selected="true"]');
    if (tab.offsetLeft < row.scrollLeft || tab.offsetLeft + tab.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
    }
  }
  // The heading names the ROM shown: its internal name when the cart has header fields, else its cartridge ID.
  const title = section.querySelector('h2 a');
  if (title) title.textContent = cart.header && cart.header.name ? cart.header.name.toLowerCase() : cart.id.toLowerCase();
  section.querySelector('.numbers').innerHTML = breakdownHtml(cart) + specHtml(cart);
  if (docs.get(`${key}:wanted`)) draw(section);
}

// The section carries the anchor of the version it shows (the READMEs link to /attic/cake-unbake/#<repo>-<version>).
function anchor(section) {
  section.id = anchorId(section.dataset.repo, section.dataset.version);
}

function select(section, version, focus) {
  if (section.dataset.version === version) return;
  section.dataset.version = version;
  anchor(section);
  render(section);
  if (focus) section.querySelector(`.tab[data-version="${CSS.escape(version)}"]`).focus();
}

function openPart(section, name) {
  const cart = docs.get(section).carts.find((c) => c.version === section.dataset.version);
  if (!partDialog || (name === 'header' && !cart.header)) return;
  partDialog.querySelector('h2').textContent = `${cart.id.toLowerCase()} ${name}`;
  partDialog.querySelector('dl').replaceChildren(
    ...partRows(cart, name).map(([k, v]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      div.append(dt, dd);
      return div;
    }),
  );
  partDialog.showModal();
}

function wire(section) {
  section.addEventListener('click', (event) => {
    const tab = event.target.closest('.tab[data-version]');
    if (tab) return select(section, tab.dataset.version, false);
    const part = event.target.closest('.part[data-part]');
    if (part) openPart(section, part.dataset.part);
  });
  section.addEventListener('keydown', (event) => {
    const tab = event.target.closest('.tab[data-version]');
    if (!tab) return;
    const tabs = [...section.querySelectorAll('.tab[data-version]')];
    const at = tabs.indexOf(tab);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    select(section, tabs[(to + tabs.length) % tabs.length].dataset.version, true);
  });
}

// The parsed map of each repo version, fetched once per visit; a failed fetch is forgotten so the next tab open retries.
const models = new Map();
const model = (repo, version) => {
  const key = `${repo} ${version}`;
  if (!models.has(key)) {
    models.set(key, fetched(mapUrl(repo, version)).then((text) => parseMap(JSON.parse(text))));
    models.get(key).catch(() => models.delete(key));
  }
  return models.get(key);
};

// Draw the map of the selected version, fetching its map file the first time. Resolves to live or none.
async function draw(section) {
  const { repo, version } = section.dataset;
  const figure = section.querySelector('.figure[data-map]');
  if (section.dataset.drawn === version) return 'live';
  if (!models.has(`${repo} ${version}`)) figure.innerHTML = '<p class="status">loading…</p>';
  try {
    const parsed = await model(repo, version);
    if (section.dataset.version !== version) return 'none';
    if (fnDialog && fnDialog.open && fnDialog.dataset.map === section.dataset.key) return 'live';
    figure.innerHTML = figureInner(parsed, repo);
    section.dataset.drawn = version;
    bind(section);
    return 'live';
  } catch {
    if (section.dataset.version === version) {
      delete section.dataset.drawn;
      unavailable(figure, repo);
    }
    return 'none';
  }
}

async function memoryMap(section) {
  docs.set(`${section.dataset.key}:wanted`, true);
  if (docs.has(section)) return draw(section);
  unavailable(section.querySelector('.figure[data-map]'), section.dataset.repo);
  return 'none';
}

const sections = [...document.querySelectorAll('section.rom[data-repo]')];
const near = 'IntersectionObserver' in window
  ? (el, run) => {
      const watcher = new IntersectionObserver((entries) => {
        if (entries.some((x) => x.isIntersecting)) {
          watcher.disconnect();
          run();
        }
      }, { rootMargin: '300px 0px' });
      watcher.observe(el);
    }
  : (el, run) => run();
// The version a location hash names, with that section brought into view.
function openHash() {
  for (const section of sections) {
    const version = versionFromHash(location.hash, section.dataset.repo, section.dataset.versions.split(' '));
    if (!version || !docs.has(section)) continue;
    select(section, version, false);
    section.scrollIntoView();
    return;
  }
}
sections.forEach((section, i) => {
  section.dataset.key = String(i);
  const version = versionFromHash(location.hash, section.dataset.repo, section.dataset.versions.split(' '));
  if (version) section.dataset.version = version;
  anchor(section);
  wire(section);
});
window.addEventListener('hashchange', openHash);
// Maps are watched once every section has its numbers, so the layout above each figure is settled.
Promise.all(sections.map(numbers)).then((ends) => {
  openHash();
  return ends;
}).then((ends) =>
  sections.forEach((section, i) =>
    near(section.querySelector('.figure[data-map]'), () => memoryMap(section).then((map) => (section.dataset.live = `${ends[i]} ${map}`))),
  ),
);
function bind(section) {
  const figure = section.querySelector('.figure[data-map]');
  const data = JSON.parse(figure.querySelector('.map-data').textContent);
  const map = figure.querySelector('.map');
  const readout = figure.querySelector('.readout');
  const dialog = document.getElementById('fn');
  const cross = figure.querySelector('.cross');
  const rows = [...map.querySelectorAll('.row')];
  const byFn = new Map();
  const byUnit = new Map();
  const push = (index, key, value) => (index.get(key) || index.set(key, []).get(key)).push(value);
  for (const slice of map.querySelectorAll('.track i[data-f]')) {
    const f = Number(slice.dataset.f);
    if (data.fns[f][1] >= 0) slice.classList.add('src');
    push(byFn, f, slice);
  }
  data.fns.forEach((fn, f) => fn[1] >= 0 && push(byUnit, fn[1], f));
  // The functions on screen in ROM order.
  const order = [...byFn.keys()].sort((a, b) => a - b);
  const neighbour = (f, step) => order[Math.min(order.length - 1, Math.max(0, order.indexOf(f) + step))];

  const hex = (value) => `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
  const source = (f) => (data.fns[f][1] < 0 ? null : sourceUrl(data.repo, data.units[data.fns[f][1]], data.fns[f][5]));
  let lit = [];
  let current = -1;
  let slice = null;
  let row = null;

  function mark(el) {
    slice = el;
    const box = map.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    cross.style.left = `${at.left - box.left + at.width / 2}px`;
    cross.hidden = false;
    const next = el.closest('.row');
    if (row !== next) {
      if (row) row.classList.remove('at');
      next.classList.add('at');
      row = next;
    }
  }

  function show(f, el) {
    if (f === current) return el && mark(el);
    for (const x of lit) x.classList.remove('on', 'sib');
    lit = [];
    current = f;
    if (f < 0) {
      map.classList.remove('lit');
      readout.textContent = '';
      cross.hidden = true;
      if (row) row.classList.remove('at');
      row = slice = null;
      return;
    }
    const fn = data.fns[f];
    for (const g of fn[1] >= 0 ? byUnit.get(fn[1]) : [f]) {
      for (const x of byFn.get(g)) {
        x.classList.add(g === f ? 'on' : 'sib');
        lit.push(x);
      }
    }
    map.classList.add('lit');
    readout.textContent = `${fn[0]} · ${about(fn)} · ${fn[3]} B · ${hex(fn[4])}`;
    mark(el || byFn.get(f)[0]);
  }

  // What the readout names after the function: its file and match.
  function about(fn) {
    return `${fn[1] >= 0 ? data.units[fn[1]].split('/').pop() : 'asm'} · ${fn[2]} %`;
  }

  function facts(f) {
    const fn = data.fns[f];
    const end = ['size', `${fn[3]} B`], at = ['rom offset', hex(fn[4])], to = ['rom end', hex(fn[4] + fn[3])];
    return [
      ['file', fn[1] >= 0 ? data.units[fn[1]] : 'asm'],
      ['match', `${fn[2]} %`],
      end,
      at,
      ...(fn[6] ? [['words', `${fn[6][0]} / ${fn[6][1]}`]] : []),
    ];
  }

  // The C file of a function, fetched once per file and kept for the rest of the visit.
  const files = new Map();
  const cText = (f) => {
    const fn = data.fns[f];
    if (fn[1] < 0) return Promise.resolve(null);
    const path = data.units[fn[1]];
    if (!files.has(path)) files.set(path, fetched(rawUrl(data.repo, path)).catch(() => null));
    return files.get(path).then((text) => (text ? functionLines(text, fn[5]) : null));
  };

  let picked = -1;
  function detail(f) {
    if (!dialog || f < 0) return;
    picked = f;
    dialog.dataset.map = section.dataset.key;
    dialog.querySelector('h2').textContent = data.fns[f][0];
    const list = dialog.querySelector('dl');
    list.replaceChildren(
      ...facts(f).map(([k, v]) => {
        const div = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        div.append(dt, dd);
        return div;
      }),
    );
    const body = dialog.querySelector('.fn-body');
    body.innerHTML = '';
    cText(f).then((code) => {
      if (picked === f && code) body.innerHTML = detailHtml({ code });
    });
    const link = dialog.querySelector('.fn-source');
    const url = source(f);
    link.hidden = !url;
    if (url) link.href = url;
    dialog.querySelector('[data-step="-1"]').disabled = f === order[0];
    dialog.querySelector('[data-step="1"]').disabled = f === order[order.length - 1];
    if (!dialog.open) dialog.showModal();
  }
  steppers.set(section.dataset.key, (step) => {
    const f = neighbour(picked, step);
    move(f);
    detail(f);
  });

  // The slice under the pointer, else the one in the same row nearest to it.
  function pick(event) {
    const hit = event.target.closest('.track i[data-f]');
    if (hit) return hit;
    // Touch can retarget the click to the map itself, so find the row by height, not by target.
    let line = event.target.closest('.row');
    let gap = Infinity;
    if (!line) {
      for (const r of rows) {
        const box = r.getBoundingClientRect();
        const d = event.clientY < box.top ? box.top - event.clientY : event.clientY > box.bottom ? event.clientY - box.bottom : 0;
        if (d < gap) [line, gap] = [r, d];
      }
    }
    if (!line || gap > 8) return null;
    let best = null;
    let distance = Infinity;
    for (const el of line.querySelectorAll('.track i[data-f]')) {
      const r = el.getBoundingClientRect();
      const d = event.clientX < r.left ? r.left - event.clientX : event.clientX > r.right ? event.clientX - r.right : 0;
      if (d < distance) [best, distance] = [el, d];
    }
    return best;
  }

  // The slice in another row nearest to the current column.
  function vertical(step) {
    const index = rows.indexOf(slice.closest('.row')) + step;
    const target = rows[index];
    if (!target) return;
    const x = slice.getBoundingClientRect();
    const middle = x.left + x.width / 2;
    let best = null;
    let distance = Infinity;
    for (const el of target.querySelectorAll('.track i[data-f]')) {
      const r = el.getBoundingClientRect();
      const d = middle < r.left ? r.left - middle : middle > r.right ? middle - r.right : 0;
      if (d < distance) [best, distance] = [el, d];
    }
    if (best) move(Number(best.dataset.f), best);
  }

  function move(f, el) {
    show(f, el);
    slice.scrollIntoView({ block: 'nearest' });
  }

  map.addEventListener('pointerover', (event) => {
    const el = event.target.closest('.track i[data-f]');
    if (el) show(Number(el.dataset.f), el);
  });
  map.addEventListener('pointerleave', () => (map.matches(':focus-visible') ? null : show(-1)));
  map.addEventListener('click', (event) => {
    const el = pick(event);
    if (!el) return;
    show(Number(el.dataset.f), el);
    detail(Number(el.dataset.f));
  });
  map.addEventListener('focus', () => current < 0 && order.length && move(order[0]));
  map.addEventListener('blur', () => (dialog && dialog.open ? null : show(-1)));
  if (dialog) dialog.addEventListener('close', () => (document.activeElement === map ? null : show(-1)));
  map.addEventListener('keydown', (event) => {
    const keys = {
      ArrowRight: () => move(neighbour(current, 1)),
      ArrowLeft: () => move(neighbour(current, -1)),
      ArrowDown: () => vertical(1),
      ArrowUp: () => vertical(-1),
      Home: () => move(order[0]),
      End: () => move(order[order.length - 1]),
      Enter: () => detail(current),
      Escape: () => map.blur(),
    };
    if (!keys[event.key] || !order.length) return;
    event.preventDefault();
    keys[event.key]();
  });
  map.tabIndex = 0;
  readout.hidden = false;
}
