// Cartridge IDs and the totals check for the cake unbake page, read from each repo's published files at build time.
//   progress.json (schema 2)      the cart of each version: its ID and the counts the page shows
//   README.md                     per version: "| <v> (<cartridge ID>, ...) |" over its ROM tree: "├ code" and "functions" bars
// A cartridge ID is taken from progress.json and must equal the README's. Every total the page shows must equal
// the README's, or the build fails and names each mismatch.
import { rawUrl } from '../assets/js/cake.js';

const count = (text) => Number(text.replace(/,/g, ''));

// Per version in the README: { id, code: [matched, total], functions: [matched, total] }.
export function parseReadme(text) {
  const entries = new Map();
  const block = /\| ([\w-]+) \(([A-Z0-9-]+),[^\n]*\|\n\|---\|\n\| <pre>([\s\S]*?)<\/pre>/g;
  for (const [, version, id, body] of text.matchAll(block)) {
    const pair = (label) => {
      const m = new RegExp(`<code>(?:[├└] )?${label}\\s+\\[[^\\]]*\\]\\s+[\\d.]+%\\s+(?:\\(~[\\d.]+%\\)\\s+)?([\\d,]+) of ([\\d,]+)`).exec(body);
      return m ? [count(m[1]), count(m[2])] : null;
    };
    entries.set(version, { id, code: pair('code'), functions: pair('functions') });
  }
  return entries;
}

// The mismatches of one version between its progress.json cart (schema 2) and README entry.
export function mismatches(version, cart, readme) {
  if (!readme) return [`${version}: README has no entry`];
  const same = (what, values) => (new Set(values.map(([, v]) => JSON.stringify(v))).size > 1
    ? [`${version} ${what}: ${values.map(([source, v]) => `${source} ${JSON.stringify(v)}`).join(', ')}`]
    : []);
  return [
    ...same('cartridge', [['progress', cart.id], ['README', readme.id]]),
    ...same('matched fn', [['progress', cart.functions.matched], ['README', readme.functions && readme.functions[0]]]),
    ...same('total fn', [['progress', cart.functions.total], ['README', readme.functions && readme.functions[1]]]),
    ...same('matched bytes', [['progress', cart.code.matched], ['README', readme.code && readme.code[0]]]),
    ...same('total bytes', [['progress', cart.code.total], ['README', readme.code && readme.code[1]]]),
  ];
}

// The cartridge ID of the game's default version after every listed version's totals agree; throws on any mismatch.
// A game whose repo has no schema 2 progress.json on main has no data yet: null, so the page leaves it out.
export async function cartridgeId(game, fetchText) {
  const get = (path) => fetchText(rawUrl(game.repo, path));
  const progress = await get('progress.json').then(JSON.parse, (error) => {
    if (error.status === 404) return null;
    throw error;
  });
  if (!progress || progress.schema !== 2) {
    console.warn(`skipping ${game.repo}: no schema 2 progress.json on main`);
    return null;
  }
  const readme = parseReadme(await get('README.md'));
  const problems = game.versions.flatMap((version) => {
    const cart = progress.carts.find((c) => c.version === version);
    return cart ? mismatches(version, cart, readme.get(version)) : [`${version}: progress.json has no cart`];
  });
  if (problems.length) throw new Error(`${game.repo} totals disagree:\n${problems.join('\n')}`);
  return progress.carts.find((c) => c.version === game.default).id;
}

export async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Object.assign(new Error(`${url}: HTTP ${response.status}`), { status: response.status });
  return response.text();
}
