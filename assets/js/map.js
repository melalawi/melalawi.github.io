// ROM memory map: hover or keyboard focus shows one function in the readout, lights the other functions of its
// source file and marks its row and column. A click, tap or Enter opens a dialog with the same facts, steps to
// the neighbouring functions and links its source on GitHub at the report's commit. A tap between slices or on a
// row's offset picks the nearest slice in the nearest row, so the thinnest functions are reachable on a phone.
// Strict mode keeps the block functions below out of the global scope (window.open stays the browser's).
'use strict';

const figures = [...document.querySelectorAll('.figure[data-map]')];
const steppers = [];
const fnDialog = document.getElementById('fn');
if (fnDialog) {
  fnDialog.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step]');
    if (button) for (const step of steppers) step(Number(button.dataset.step));
  });
}

for (const figure of figures) {
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

  const hex = (value) => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
  const source = (f) => (data.fns[f][1] < 0 ? null : `https://github.com/${data.repo}/blob/${data.ref}/${data.units[data.fns[f][1]]}`);
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
    const unit = fn[1] >= 0 ? data.units[fn[1]].split('/').pop() : 'asm';
    readout.textContent = `${fn[0]} · ${unit} · ${fn[2]} % · ${fn[3]} B · ${hex(fn[4])}`;
    mark(el || byFn.get(f)[0]);
  }

  function facts(f) {
    const fn = data.fns[f];
    return [
      ['file', fn[1] >= 0 ? data.units[fn[1]] : 'asm'],
      ['match', `${fn[2]} %`],
      ['size', `${fn[3]} B`],
      ['address', hex(fn[4])],
    ];
  }

  let picked = -1;
  function detail(f) {
    if (!dialog || f < 0) return;
    picked = f;
    dialog.dataset.map = figures.indexOf(figure);
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
    const link = dialog.querySelector('.fn-source');
    const url = source(f);
    link.hidden = !url;
    if (url) link.href = url;
    dialog.querySelector('[data-step="-1"]').disabled = f === 0;
    dialog.querySelector('[data-step="1"]').disabled = f === data.fns.length - 1;
    if (!dialog.open) dialog.showModal();
  }
  steppers.push((step) => {
    if (dialog.dataset.map !== String(figures.indexOf(figure))) return;
    const f = Math.min(data.fns.length - 1, Math.max(0, picked + step));
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
  map.addEventListener('focus', () => current < 0 && move(0));
  map.addEventListener('blur', () => (dialog && dialog.open ? null : show(-1)));
  if (dialog) dialog.addEventListener('close', () => (document.activeElement === map ? null : show(-1)));
  map.addEventListener('keydown', (event) => {
    const keys = {
      ArrowRight: () => move(Math.min(data.fns.length - 1, current + 1)),
      ArrowLeft: () => move(Math.max(0, current - 1)),
      ArrowDown: () => vertical(1),
      ArrowUp: () => vertical(-1),
      Home: () => move(0),
      End: () => move(data.fns.length - 1),
      Enter: () => detail(current),
      Escape: () => map.blur(),
    };
    if (!keys[event.key]) return;
    event.preventDefault();
    keys[event.key]();
  });
  map.tabIndex = 0;
  readout.hidden = false;
}
