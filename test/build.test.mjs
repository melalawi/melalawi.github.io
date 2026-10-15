import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, fetchSources, renderSite, reportUrl, verify } from '../build/build.mjs';
import { parsePost } from '../build/blog.mjs';
import { parseReport } from '../build/report.mjs';
import { anchorHeadings, bookIndex } from '../build/html.mjs';

const games = [{ id: 'one', repo: 'Org/game-one', wiki: 'https://wiki.test/Game_One', branch: 'main', versions: ['us', 'eu'], default: 'us' }];
const site = {
  title: 'site', handle: 'me', url: 'https://example.test', tagline: 't', links: [], games,
  contact: { action: 'https://forms.example/x', next: '/thanks', subject: 'Hi', button: 'send' },
  resume: { drive: 'R1', updated: '2021-09-08' },
};
const report = {
  measures: { matched_code: '100', total_code: '300', matched_functions: 1, total_functions: 2 },
  units: [
    { metadata: { complete: true, source_path: 'a.c', progress_categories: ['span_1000'] }, functions: [{ name: 'func_80000400', address: '2147484672', size: '100', fuzzy_match_percent: 100 }] },
    { metadata: { complete: false, source_path: 'b.c', progress_categories: ['span_1000'] }, functions: [{ name: 'func_80000464', address: '2147484772', size: '200', fuzzy_match_percent: 87.4 }] },
  ],
};
const row = (version, code, functions) =>
  `| ${version} (X). SHA256 \`0\` |\n|---|\n| <pre><code>code      [█]  1.00% (~1.00%)  ${code}</code><br><code>functions [█]  1.00% (~1.00%)  ${functions}</code></pre> |\n`;
const readme = (rows) =>
  `<!-- progress -->\n${rows.join('\n')}<!-- /progress -->\n\n## Dependencies\n\n- [GCC 2.7.2 (KMC)](https://example.test/gcc) at \`abc\`, the compiler of toolchain \`gcc-2.7.2-kmc\`, assembled by SN ASN64 version 2.81\n`;
const config = `[project]\ntoolchain = "gcc-2.7.2-kmc"\n\n[version.us]\ncartridge_id = "NUS-NXXE-1"\nregion = "North America"\n\n[version.eu]\ncartridge_id = "NUS-NXXP-0"\nregion = "Europe"\n`;
const sources = () => ({
  commits: new Map([['one', 'c0ffee']]),
  reports: new Map([['one/us', parseReport(report)], ['one/eu', parseReport(report)]]),
  readmes: new Map([['one', readme([row('us', '100 of 300', '1 of 2'), row('eu', '100 of 300', '1 of 2')])]]),
  configs: new Map([['one', config]]),
});
const page = (title = 't') => ({ data: { title }, body: 'Body' });
const post = (d, slug, tags) =>
  parsePost(`${d.slice(0, 4)}/${d.slice(5)}-${slug}.md`, `---\ntitle: ${slug}\ndate: ${d}\ntags: [${tags}]\nsummary: s\n---\nx\n`);

test('reportUrl points at the public per-version report', () => {
  assert.equal(reportUrl(games[0], 'eu'), 'https://raw.githubusercontent.com/Org/game-one/main/versions/eu/report.json');
});

test('fetchSources reads every report, README and config.toml and fails on any bad response', async () => {
  const seen = [];
  const ok = async (url, init) => {
    seen.push([url, init.headers]);
    return { ok: true, json: async () => report, text: async () => (url.includes('api.github.com') ? 'c0ffee\n' : url.endsWith('config.toml') ? 'cfg' : 'readme') };
  };
  const fetched = await fetchSources(site, ok, 'tok');
  assert.equal(fetched.commits.get('one'), 'c0ffee');
  assert.deepEqual(seen[0], ['https://api.github.com/repos/Org/game-one/commits/main', { accept: 'application/vnd.github.sha', authorization: 'Bearer tok' }]);
  assert.ok(seen.slice(1).every(([url]) => url.startsWith('https://raw.githubusercontent.com/Org/game-one/c0ffee/')));
  assert.deepEqual([...fetched.reports.keys()], ['one/us', 'one/eu']);
  assert.equal(fetched.readmes.get('one'), 'readme');
  assert.equal(fetched.configs.get('one'), 'cfg');
  const bad = async (url, init) => (url.includes('/eu/') ? { ok: false, status: 404 } : ok(url, init));
  await assert.rejects(fetchSources(site, bad), /eu\/report.json: HTTP 404/);
});

test('verify passes when report, measures and README agree', () => {
  assert.deepEqual(verify(site, sources()), []);
});

test('verify fails on a stale README, a missing row and drifted measures', () => {
  const drifted = parseReport({ ...report, measures: { ...report.measures, matched_functions: 2 } });
  const reports = new Map([['one/us', parseReport(report)], ['one/eu', drifted]]);
  const readmes = new Map([['one', readme([row('us', '150 of 300', '1 of 2')])]]);
  assert.deepEqual(verify(site, { reports, readmes }), [
    'Org/game-one us README: exactBytes computed 100 but 150 expected',
    'Org/game-one eu report.json measures: exact computed 1 but 2 expected',
    'Org/game-one eu: README has no row for this version',
  ]);
});

const render = () => {
  const posts = ['2026-01-04', '2026-01-03'].map((d, i) => post(d, `p${i}`, 'x'));
  const archive = [{ slug: 'ext', data: { title: 'Ext', subtitle: 'a browser extension', years: '2015', icon: '/i.png', links: [{ label: 'source', href: 'https://example.test/ext' }] }, body: '' }];
  const cake = { data: { title: 'cake unbake' }, body: '' };
  const pages = { home: page(), contact: page(), 404: page(), 'cake-unbake': cake };
  return renderSite({ site, pages, archive, posts }, sources());
};

test('renderSite writes every page, tag page and the feed, and no old routes', () => {
  const out = render();
  for (const path of [
    'index.html', 'attic/index.html', 'attic/cake-unbake/index.html', 'attic/archive/index.html', 'blog/index.html',
    'blog/2026/01-04-p0/index.html', 'blog/tags/x/index.html', 'blog/feed.xml', 'contact/index.html', '404.html',
  ]) {
    assert.ok(out.has(path), path);
  }
  assert.ok(![...out.keys()].some((path) => /^(projects|attic\/decomp|attic\/ext)/.test(path) || path.endsWith('.json')));
  const home = out.get('index.html');
  const labels = [...home.matchAll(/<span class="entry"><a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(labels, [['home', '/'], ['attic', '/attic/'], ['blog', '/blog/'], ['contact', '/contact/']]);
  const contact = out.get('contact/index.html');
  for (const field of ['action="https://forms.example/x"', 'name="email"', 'name="name"', 'name="message"', 'name="_next" value="/thanks"', 'name="_subject" value="Hi"', 'name="_gotcha"']) {
    assert.ok(contact.includes(field), field);
  }
});

test('cake unbake shows cartridge IDs linked to the game article, spec rows and a byte-wide memory map, and names no game in visible text', () => {
  const html = render().get('attic/cake-unbake/index.html');
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ');
  assert.ok(!/decomp|game-one/i.test(visible));
  assert.ok(!html.includes('class="prose"'));
  assert.ok(!/footnote|report\.json|README/.test(visible));
  assert.match(html, /<h2 id="nus-nxxe-1"><a href="https:\/\/wiki\.test\/Game_One">NUS-NXXE-1<\/a><\/h2>/);
  assert.ok(!/toolchain|mips-|GCC/.test(visible));
  const rows = [...html.matchAll(/<div><dt>([^<]+)<\/dt><dd>([^<]*)<\/dd><\/div>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(rows, [
    ['cartridge', 'NUS-NXXE-1'], ['region', 'us'], ['revision', '1'], ['versions', 'us, eu'], ['matched fn', '1 / 2'], ['% .text', '33.33 %'],
    ['matched bytes', '100 / 300 B'], ['fuzzy fn', '1'], ['asm fn', '0'],
  ]);
  assert.equal(html.split('<dialog class="modal" id="fn"')[0].match(/>source<\/a>/g).length, 1);
  assert.match(html, /<div><a href="https:\/\/github.com\/Org\/game-one">source<\/a><\/div><\/dl>/);
  assert.ok(!/ · /.test(html.split('<dl class="spec">')[1].split('</dl>')[0]));
  assert.ok(!/<figcaption|class="sub"|class="prose"|North America|KiB per row/.test(html.split('<main')[1]));
  assert.match(html, /<tr><td>eu<\/td><td>NUS-NXXP-0<\/td><td data-label="fn">\d+\/2<\/td><td data-label=".text">[\d.]+%<\/td><td data-label="B">/);
  assert.ok(!html.includes('table-scroll'));
  assert.match(html, /class="q10 s" data-f="0" style="left:25%;width:0.61%"><\/i>/);
  assert.match(html, /class="q8 s" data-f="1" style="left:25.61%;width:1.221%"><\/i>/);
  const data = JSON.parse(html.match(/<script type="application\/json" class="map-data">([^<]*)<\/script>/)[1]);
  assert.deepEqual(data, {
    repo: 'Org/game-one',
    ref: 'c0ffee',
    units: ['a.c', 'b.c'],
    fns: [['func_80000400', 0, 100, 100, 0x80000400], ['func_80000464', 1, 87, 200, 0x80000464]],
  });
  assert.match(html, /<p class="readout" hidden><\/p>/);
  assert.match(html, /<b class="cross" hidden><\/b><\/div>/);
  assert.match(html, /<script defer src="\/js\/map.js"><\/script>/);
});

test('attic lists cake unbake then archive as the last row; the archive lists compact entries', () => {
  const out = render();
  const attic = out.get('attic/index.html').split('<main')[1];
  const rows = attic.match(/<li><a href="([^"]+)"/g);
  assert.deepEqual(rows, ['<li><a href="/attic/cake-unbake/"', '<li><a href="/attic/archive/"']);
  const side = out.get('attic/index.html').split('<main')[0];
  assert.ok(side.indexOf('>cake unbake<') < side.indexOf('>archive<'));
  const archive = out.get('attic/archive/index.html');
  assert.match(archive, /<img class="icon" src="\/i.png" alt="" width="20" height="20"><span><strong>Ext<\/strong>/);
  assert.ok(archive.includes('2015 · <a href="https://example.test/ext">source</a>'));
  assert.ok(!/defunct|for fun/.test(attic + archive));
});

test('anchorHeadings gives each h2 a slug id', () => {
  assert.equal(anchorHeadings('<h2>What I Do</h2><h2>My <em>Resume</em></h2>'), '<h2 id="what-i-do">What I Do</h2><h2 id="my-resume">My <em>Resume</em></h2>');
});

test('bookIndex keeps entry order and each entry\'s section order', () => {
  const html = bookIndex(
    [
      { label: 'Home', href: '/', children: [] },
      { label: 'Attic', href: '/attic/', children: [{ label: 'Zed', href: '/attic/z/' }, { label: 'Alpha', href: '/attic/a/' }] },
    ],
    '/attic/a/',
  );
  assert.ok(html.indexOf('Home') < html.indexOf('Attic'));
  assert.ok(html.indexOf('Zed') < html.indexOf('Alpha'));
  assert.ok(!html.includes('class="letter"'));
  assert.match(html, /<li><span class="entry"><a href="\/">Home<\/a><\/span><\/li>/);
  assert.match(html, /href="\/attic\/a\/" aria-current="page">Alpha/);
  assert.ok(!/href="\/"[^>]*aria-current/.test(html));
});

// Cart IDs and proper nouns stay as data; every other title, heading, index entry, option and label is lowercase.
const KEEP = /NUS-[A-Z0-9-]+|\b(?:AWS|Vancouver|C|N64|ROMs|Ext|B|KiB)\b/g;
test('titles, headings, index entries, buttons and labels are lowercase', () => {
  for (const [path, html] of render()) {
    if (!path.endsWith('.html') || /^blog\/\d/.test(path)) continue;
    const nav = html.split('<ul class="entries">')[1].split('</nav>')[0];
    const texts = [
      ...[...html.matchAll(/<(title|h1|h2|button|figcaption|th|dt)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]),
      ...[...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].filter((m) => !/^\/blog\/\d/.test(m[1])).map((m) => m[2]),
      ...[...html.matchAll(/<label[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[1]),
      ...[...html.matchAll(/class="button"[^>]*>([^<]+)</g)].map((m) => m[1]),
      ...[...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]),
    ];
    assert.ok(texts.length > 5, path);
    for (const text of texts) {
      const plain = text.replace(/<[^>]*>/g, '').replace(KEEP, '');
      assert.equal(plain, plain.toLowerCase(), `${path}: ${text}`);
    }
  }
});

test('one glyph toggle flips light and dark, and the head script sets the stored theme before paint', () => {
  const html = render().get('index.html');
  const head = html.split('</head>')[0];
  assert.match(head, /<meta name="color-scheme" content="light dark">/);
  assert.match(head, /<script>try\{var t=localStorage\.getItem\('theme'\);if\(t==='light'\|\|t==='dark'\)document\.documentElement\.dataset\.theme=t\}catch\(e\)\{\}<\/script>/);
  const toggles = html.match(/<button class="theme-toggle"[^>]*>/g);
  assert.deepEqual(toggles, ['<button class="theme-toggle" type="button" aria-label="switch theme" title="switch theme" hidden>']);
  assert.match(html, /<div class="brand"><a class="name" href="\/">[^]*?<\/a><button class="theme-toggle"/);
  assert.ok(!html.includes('index-title'));
  assert.ok(!/system|class="theme"/.test(html.split('<nav')[1].split('</nav>')[0].replace(/<svg[\s\S]*?<\/svg>/, '')));
  assert.match(html, /var t=dark\(\)\?'light':'dark';r\.dataset\.theme=t;try\{localStorage\.setItem\('theme',t\)\}catch\(e\)\{\}/);
});

test('the real pages and site.json keep titles, headings, buttons and labels lowercase', async () => {
  const files = ['home', 'contact', '404', 'cake-unbake'].map((name) => join(ROOT, 'content', `${name}.md`));
  const texts = [];
  for (const file of files) {
    const md = await readFile(file, 'utf8');
    texts.push(...[...md.matchAll(/^(?:title: |#+ )(.+)$/gm)].map((m) => m[1]));
    texts.push(...[...md.matchAll(/class="button"[^>]*>([^<]+)</g)].map((m) => m[1]));
  }
  const real = JSON.parse(await readFile(join(ROOT, 'site.json'), 'utf8'));
  texts.push(real.title, real.handle, real.tagline, real.contact.button, ...real.links.map((l) => l.label));
  assert.ok(texts.length > 12);
  for (const text of texts) {
    const plain = text.replace(KEEP, '');
    assert.equal(plain, plain.toLowerCase(), text);
  }
});

test('the site title ends in an underscore cursor and loads no web font', () => {
  assert.ok(!/woff2|rel="preload"/.test(render().get('index.html')));
  assert.match(render().get('index.html'), /<a class="name" href="\/">me<span class="caret" aria-hidden="true">_<\/span><\/a>/);
});

test('the resume opens in a dialog on every page and no about page exists or is linked', () => {
  const out = render();
  for (const [path, html] of out) {
    if (!path.endsWith('.html')) continue;
    assert.ok(!html.includes('href="/about/'), path);
    assert.match(html, /<a href="https:\/\/drive\.google\.com\/file\/d\/R1\/view" data-modal="resume">my resume<\/a>/, path);
    assert.match(html, /<dialog class="modal" id="resume"[\s\S]*data-src="https:\/\/drive\.google\.com\/file\/d\/R1\/preview"[\s\S]*open pdf to print/, path);
  }
  assert.ok(![...out.keys()].some((path) => path.startsWith('about/')));
});

test('the memory map page carries one function dialog with steps and a source link', () => {
  const html = render().get('attic/cake-unbake/index.html');
  assert.equal(html.match(/<dialog class="modal" id="fn"/g).length, 1);
  assert.match(html, /data-step="-1"[\s\S]*data-step="1"[\s\S]*class="fn-source"/);
});
