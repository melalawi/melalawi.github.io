// Turns an objdiff report.json into heatmap modules and recalculated totals,
// and cross-checks those totals against the report's own measures and the project README.

export const BUCKETS = 10;

// Fuzzy percent of one function. A function with no C source scores 0.
export function functionPercent(unit, fn) {
  if (!unit.metadata || !unit.metadata.source_path) return 0;
  const value = fn.fuzzy_match_percent;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// Exact means objdiff scored the function 100 and its unit is complete (landed source, not a draft).
export function functionExact(unit, fn) {
  return Boolean(unit.metadata && unit.metadata.complete) && fn.fuzzy_match_percent === 100;
}

// Colour step. 0 is no C, BUCKETS is exact, every other function spreads over 1..BUCKETS-1.
export function bucket(percent, exact) {
  if (exact) return BUCKETS;
  if (percent <= 0) return 0;
  return 1 + Math.min(BUCKETS - 2, Math.floor((percent / 100) * (BUCKETS - 1)));
}

function spanOrder(id) {
  const match = /^span_([0-9A-Fa-f]+)$/.exec(id);
  return match ? parseInt(match[1], 16) : Number.MAX_SAFE_INTEGER;
}

// Modules in ROM order. A module is the unit's first progress category.
export function parseReport(report) {
  if (!report || !Array.isArray(report.units)) {
    throw new TypeError('report.json has no units array');
  }
  const modules = new Map();
  for (const unit of report.units) {
    for (const fn of unit.functions || []) {
      const categories = (unit.metadata && unit.metadata.progress_categories) || [];
      const id = categories[0] || 'unknown';
      if (!modules.has(id)) modules.set(id, []);
      modules.get(id).push({
        name: fn.name,
        address: Number(fn.address),
        size: Number(fn.size),
        percent: functionPercent(unit, fn),
        exact: functionExact(unit, fn),
        unit: (unit.metadata && unit.metadata.source_path) || null,
      });
    }
  }
  const ordered = [...modules.entries()].map(([id, fns]) => {
    fns.sort((a, b) => a.address - b.address);
    return { id, fns };
  });
  ordered.sort((a, b) => spanOrder(a.id) - spanOrder(b.id) || a.fns[0].address - b.fns[0].address);
  return { modules: ordered, totals: totals(ordered.flatMap((m) => m.fns)), measures: report.measures || {} };
}

// Byte-weighted totals over functions.
export function totals(fns) {
  let bytes = 0;
  let exactBytes = 0;
  let weighted = 0;
  let exact = 0;
  let fuzzy = 0;
  let none = 0;
  for (const fn of fns) {
    bytes += fn.size;
    weighted += fn.size * fn.percent;
    if (fn.exact) {
      exact += 1;
      exactBytes += fn.size;
    } else if (fn.percent > 0) {
      fuzzy += 1;
    } else {
      none += 1;
    }
  }
  return {
    functions: fns.length,
    exact,
    fuzzy,
    none,
    bytes,
    exactBytes,
    exactPercent: bytes ? (exactBytes / bytes) * 100 : 0,
    fuzzyPercent: bytes ? weighted / bytes : 0,
  };
}

const KEYS = ['exactBytes', 'bytes', 'exact', 'functions'];

// The four counts objdiff states in its own top-level measures.
export function measuresCounts(measures) {
  return {
    exactBytes: Number(measures.matched_code),
    bytes: Number(measures.total_code),
    exact: Number(measures.matched_functions),
    functions: Number(measures.total_functions),
  };
}

const number = (text) => Number(text.replace(/,/g, ''));

// Per-version code and functions rows from the README progress block.
export function readmeCounts(markdown) {
  const block = /<!-- progress -->([\s\S]*?)<!-- \/progress -->/.exec(markdown);
  if (!block) throw new Error('README has no progress block');
  const out = new Map();
  const sections = block[1].split(/\n(?=\| [a-z0-9-]+ \()/);
  for (const section of sections) {
    const version = /^\| ([a-z0-9-]+) \(/.exec(section);
    if (!version) continue;
    const code = /code\s+\[[^\]]*\]\s+[\d.]+%(?: \(~[\d.]+%\))?\s+([\d,]+) of ([\d,]+)/.exec(section);
    const functions = /functions\s+\[[^\]]*\]\s+[\d.]+%(?: \(~[\d.]+%\))?\s+([\d,]+) of ([\d,]+)/.exec(section);
    if (!code || !functions) throw new Error(`README row ${version[1]} lacks code or functions counts`);
    out.set(version[1], {
      exactBytes: number(code[1]),
      bytes: number(code[2]),
      exact: number(functions[1]),
      functions: number(functions[2]),
    });
  }
  return out;
}

// One line per count that differs. Empty when they agree.
export function compareCounts(label, computed, expected) {
  return KEYS.filter((key) => computed[key] !== expected[key]).map(
    (key) => `${label}: ${key} computed ${computed[key]} but ${expected[key]} expected`,
  );
}
