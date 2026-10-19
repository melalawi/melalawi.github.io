import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, renderSite } from '../build/build.mjs';
import { parsePost } from '../build/blog.mjs';
import { analyticsBeacon, anchorHeadings, bookIndex } from '../build/html.mjs';

const games = [{ id: 'one', repo: 'Org/game-one', wiki: 'https://wiki.test/Game_One', versions: ['us', 'eu'], default: 'us' }];
const site = {
  title: 'site', handle: 'me', url: 'https://example.test', tagline: 't', links: [], games,
  contact: { action: 'https://forms.example/x', next: '/thanks', subject: 'Hi', button: 'send' },
  resume: { drive: 'R1', updated: '2021-09-08' },
};
const page = (title = 't') => ({ data: { title }, body: 'Body' });
const post = (d, slug, tags) =>
  parsePost(`${d.slice(0, 4)}/${d.slice(5)}-${slug}.md`, `---\ntitle: ${slug}\ndate: ${d}\ntags: [${tags}]\nsummary: s\n---\nx\n`);

const render = () => {
  const posts = ['2026-01-04', '2026-01-03'].map((d, i) => post(d, `p${i}`, 'x'));
  const archive = [{ slug: 'ext', data: { title: 'Ext', subtitle: 'a browser extension', years: '2015', icon: '/i.png', links: [{ label: 'source', href: 'https://example.test/ext' }] }, body: '' }];
  const cake = { data: { title: 'cake unbake' }, body: '' };
  const pages = { home: page(), contact: page(), 404: page(), 'cake-unbake': cake };
  return renderSite({ site, pages, archive, posts, cartridges: { one: 'NUS-NXXE-1' } });
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

test('cake unbake builds a frame per ROM with no numbers, linked to the game article, and names no game in visible text', () => {
  const html = render().get('attic/cake-unbake/index.html');
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ');
  assert.ok(!/decomp|game-one|toolchain/i.test(visible));
  assert.ok(!html.includes('class="prose"'));
  const main = html.split('<main')[1].split('<dialog')[0];
  assert.ok(!/class="(spec|versions|map|map-data)"/.test(main));
  assert.equal(main.replace(/<[^>]*>/g, ' ').replace(/NUS-[A-Z0-9-]+/g, '').match(/\d/), null);
  assert.match(html, /<section class="rom" data-repo="Org\/game-one" data-version="us" data-versions="us eu">\n<h2 id="nus-nxxe-1"><a href="https:\/\/wiki\.test\/Game_One">NUS-NXXE-1<\/a><\/h2>\n<div class="numbers"><p class="status">loading…<\/p><\/div>\n<figure class="figure" data-map><p class="status">loading…<\/p><\/figure>\n<\/section>/);
  assert.match(html, /<script type="module" src="\/js\/map.js"><\/script>/);
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

test('analyticsBeacon renders the Cloudflare beacon only when a token is set, and every page carries it', () => {
  assert.equal(analyticsBeacon(undefined), '');
  assert.equal(analyticsBeacon({}), '');
  assert.equal(
    analyticsBeacon({ cloudflare: 'abc' }),
    '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{&quot;token&quot;:&quot;abc&quot;}"></script>\n',
  );
  const pages = { home: page(), contact: page(), 404: page(), 'cake-unbake': page() };
  const out = renderSite({ site: { ...site, analytics: { cloudflare: 'abc' } }, pages, archive: [], posts: [], cartridges: { one: 'NUS-NXXE-1' } });
  for (const [path, html] of out) {
    if (path.endsWith('.html')) assert.match(html, /data-cf-beacon="\{&quot;token&quot;:&quot;abc&quot;\}"><\/script>\n<\/body>/, path);
  }
  assert.ok(!render().get('index.html').includes('cloudflareinsights'));
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

test('a game whose repo has no schema 2 progress.json on main is left out of the cake unbake page and the build still succeeds', async () => {
  const { mkdir, mkdtemp, rm } = await import('node:fs/promises');
  const { progress: fixture } = await import('./fixtures.mjs');
  const real = JSON.parse(await readFile(join(ROOT, 'site.json'), 'utf8'));
  const [first, second] = real.games;
  const id = (v) => `NUS-NXXE-${v.length}`;
  const doc = { ...fixture, carts: first.versions.map((v) => ({ ...fixture.carts[1], version: v, id: id(v) })), map: { ...fixture.map, version: first.default } };
  const fmt = (n) => n.toLocaleString('en-US');
  const readme = doc.carts.map((c) => `| ${c.version} (${c.id}, North America). SHA256 \`x\` |\n|---|\n| <pre><code>code      [█░░░]  50.00%  ${fmt(c.code.matched)} of ${fmt(c.code.total)}</code><br><code>functions [█░░░]  50.00%  ${fmt(c.functions.matched)} of ${fmt(c.functions.total)}</code></pre> |\n`).join('\n');
  const fetchSource = async (url) => {
    const [, repo, path] = /githubusercontent\.com\/(.+?\/.+?)\/main\/(.+)$/.exec(url);
    if (repo !== first.repo) throw Object.assign(new Error(`${url}: HTTP 404`), { status: 404 });
    return path === 'progress.json' ? JSON.stringify(doc) : readme;
  };
  await mkdir(join(ROOT, 'dist'), { recursive: true });
  const outDir = await mkdtemp(join(ROOT, 'dist', 'test-'));
  const warn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  try {
    await (await import('../build/build.mjs')).build({ outDir, fetchSource });
    const html = await readFile(join(outDir, 'attic/cake-unbake/index.html'), 'utf8');
    assert.ok(html.includes(`data-repo="${first.repo}"`));
    assert.ok(!html.includes(`data-repo="${second.repo}"`));
    assert.match(warnings.join('\n'), new RegExp(`skipping ${second.repo}`));
  } finally {
    console.warn = warn;
    await rm(outDir, { recursive: true, force: true });
  }
});
