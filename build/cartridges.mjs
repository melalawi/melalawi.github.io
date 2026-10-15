// Cartridge IDs and the totals check for the cake unbake page, read from each repo's published files at build time.
//   progress.json                 the cart of each version: its ID and the counts the page shows
//   versions/<v>/report.json      the measures and every function with its fuzzy percent
//   README.md                     per version: "| <v> (<cartridge ID>, ...) |" over a block of code and function totals
// A cartridge ID is taken from progress.json and must equal the README's. Every total the page shows must equal
// the report's and the README's, or the build fails and names each mismatch.
import { rawUrl } from '../assets/js/cake.js';

const count = (text) => Number(text.replace(/,/g, ''));

// Per version in the README: { id, code: [matched, total], functions: [matched, total] }.
export function parseReadme(text) {
  const entries = new Map();
  const block = /\| ([\w-]+) \(([A-Z0-9-]+),[^\n]*\|\n\|---\|\n\| <pre>([\s\S]*?)<\/pre>/g;
  for (const [, version, id, body] of text.matchAll(block)) {
    const pair = (label) => {
      const m = new RegExp(`<code>${label}\\s+\\[[^\\]]*\\]\\s+[\\d.]+%(?: \\(~[\\d.]+%\\))?\\s+([\\d,]+) of ([\\d,]+)`).exec(body);
      return m ? [count(m[1]), count(m[2])] : null;
    };
    entries.set(version, { id, code: pair('code'), functions: pair('functions') });
  }
  return entries;
}

// Functions that are exact: fuzzy percent 100 in a unit whose code is complete.
export function exactFunctions(report) {
  let exact = 0;
  for (const unit of report.units) {
    const m = unit.measures;
    const complete = Number(m.total_code || 0) > 0 && m.complete_code === m.total_code;
    if (complete) exact += (unit.functions || []).filter((fn) => fn.fuzzy_match_percent === 100).length;
  }
  return exact;
}

const same = (what, values) => (new Set(values.map(([, v]) => JSON.stringify(v))).size > 1
  ? [`${what}: ${values.map(([source, v]) => `${source} ${JSON.stringify(v)}`).join(', ')}`]
  : []);

// The mismatches of one version between its progress.json cart, report.json and README entry.
export function mismatches(version, cart, report, readme) {
  const m = report.measures;
  const listed = report.units.reduce((sum, unit) => sum + (unit.functions || []).length, 0);
  if (!readme) return [`${version}: README has no entry`];
  const found = [
    ...same(`${version} cartridge`, [['progress', cart.id], ['README', readme.id]]),
    ...same(`${version} matched fn`, [['progress', cart.functions.matched], ['report', Number(m.matched_functions)], ['report exact fn', exactFunctions(report)], ['README', readme.functions && readme.functions[0]]]),
    ...same(`${version} total fn`, [['progress', cart.functions.total], ['report', Number(m.total_functions)], ['report fn list', listed], ['README', readme.functions && readme.functions[1]]]),
    ...same(`${version} matched bytes`, [['progress', cart.bytes.matched], ['report', Number(m.matched_code)], ['README', readme.code && readme.code[0]]]),
    ...same(`${version} total bytes`, [['progress', cart.bytes.total], ['report', Number(m.total_code)], ['README', readme.code && readme.code[1]]]),
  ];
  return found;
}

// The cartridge ID of the game's default version after every listed version's totals agree; throws on any mismatch.
export async function cartridgeId(game, fetchText) {
  const get = (path) => fetchText(rawUrl(game.repo, path));
  const [progress, readme, ...reports] = await Promise.all([
    get('progress.json').then(JSON.parse),
    get('README.md').then(parseReadme),
    ...game.versions.map((version) => get(`versions/${version}/report.json`).then(JSON.parse)),
  ]);
  const problems = game.versions.flatMap((version, i) => {
    const cart = progress.carts.find((c) => c.version === version);
    return cart ? mismatches(version, cart, reports[i], readme.get(version)) : [`${version}: progress.json has no cart`];
  });
  if (problems.length) throw new Error(`${game.repo} totals disagree:\n${problems.join('\n')}`);
  return progress.carts.find((c) => c.version === game.default).id;
}

export async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
