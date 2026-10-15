// npm run build: markdown to static HTML in dist/. Cake unbake numbers are not built in: the page reads them live.
import { mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { groupByYear, parsePost, sortPosts, splitFrontMatter, tagIndex, tagSlug } from './blog.mjs';
import { anchorHeadings, CLOSE, escapeHtml, heading, layout, postList, resumeUrl, slugify, tagLinks } from './html.mjs';
import { rss } from './rss.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = ['tokens.css', 'atoms.css', 'site.css'];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])),
  );
  return files.flat();
}

async function loadContent(root) {
  const site = JSON.parse(await readFile(join(root, 'site.json'), 'utf8'));
  const pages = {};
  for (const name of ['home', 'contact', '404', 'cake-unbake']) {
    pages[name] = splitFrontMatter(await readFile(join(root, 'content', `${name}.md`), 'utf8'));
  }
  const archiveFiles = (await walk(join(root, 'content', 'archive'))).filter((f) => f.endsWith('.md')).sort();
  const archive = await Promise.all(
    archiveFiles.map(async (file) => ({
      slug: basename(file, '.md'),
      ...splitFrontMatter(await readFile(file, 'utf8')),
    })),
  );
  archive.sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
  const postsDir = join(root, 'posts');
  const postFiles = (await walk(postsDir)).filter((f) => f.endsWith('.md'));
  const posts = await Promise.all(
    postFiles.map(async (file) => parsePost(relative(postsDir, file), await readFile(file, 'utf8'))),
  );
  return { site, pages, archive, posts: sortPosts(posts) };
}

function article(page, extra = '') {
  return `${heading(page.data.title, page.data.subtitle)}
<article class="prose">${anchorHeadings(marked.parse(page.body))}</article>${extra}`;
}

function contactForm(contact) {
  return `<form class="contact-form container axis-column gap-3" method="post" action="${escapeHtml(contact.action)}">
<label class="field container axis-column gap-1"><span>email address *</span><input class="text-input" type="text" name="email" placeholder="your email address..." required></label>
<label class="field container axis-column gap-1"><span>name *</span><input class="text-input" type="text" name="name" placeholder="your name..." required></label>
<label class="field container axis-column gap-1"><span>message *</span><textarea class="text-input" name="message" placeholder="your message..." rows="6" required></textarea></label>
<input type="hidden" name="_next" value="${escapeHtml(contact.next)}">
<input type="hidden" name="_subject" value="${escapeHtml(contact.subject)}">
<input type="text" name="_gotcha" hidden tabindex="-1" autocomplete="off">
<div class="container axis-row"><button class="button" type="submit">${escapeHtml(contact.button)}</button></div>
</form>`;
}

// One ROM: its heading and an empty frame. The page script fills the numbers from the repo's progress.json and,
// once the figure nears the screen, the memory map from its published SVG and symbols.json.
function romSection(game) {
  return `<section class="rom" data-repo="${escapeHtml(game.repo)}" data-version="${escapeHtml(game.default)}" data-versions="${escapeHtml(game.versions.join(' '))}">
<h2 id="${slugify(game.cart)}"><a href="${escapeHtml(game.wiki)}">${escapeHtml(game.cart)}</a></h2>
<div class="numbers"><p class="status">loading…</p></div>
<figure class="figure" data-map><p class="status">loading…</p></figure>
</section>`;
}

function archiveEntry({ data }) {
  const links = (data.links || []).map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`).join(' · ');
  return `<li><img class="icon" src="${escapeHtml(data.icon)}" alt="" width="20" height="20"><span><strong>${escapeHtml(data.title)}</strong> <span class="sub">${escapeHtml(data.subtitle)}</span><span class="note">${escapeHtml(data.years)}${links ? ` · ${links}` : ''}</span></span></li>`;
}

// The index beside every page: the site entries in fixed order (the title links home), each with its own sections nested under it.
function siteIndex({ site, posts }) {
  return [
    { label: 'home', href: '/', children: site.resume ? [{ label: 'my resume', href: resumeUrl(site.resume), modal: 'resume' }] : [] },
    {
      label: 'attic',
      href: '/attic/',
      children: [
        { label: 'cake unbake', href: '/attic/cake-unbake/' },
        { label: 'archive', href: '/attic/archive/' },
      ],
    },
    { label: 'blog', href: '/blog/', children: posts.slice(0, 5).map((p) => ({ label: p.title, href: p.url })) },
    { label: 'contact', href: '/contact/', children: [] },
  ];
}

// Every output file as a path to content map. Pure apart from markdown rendering.
export function renderSite(content) {
  const { site, pages, archive, posts } = content;
  const index = siteIndex(content);
  const out = new Map();
  const page = (path, title, body, extra = {}) => layout(site, { title, path, body, index, ...extra });

  out.set('index.html', page('/', '', article(pages.home)));

  const cake = pages['cake-unbake'];
  out.set(
    'attic/cake-unbake/index.html',
    page('/attic/cake-unbake/', cake.data.title, `<p class="back"><a href="/attic/">attic</a></p>
${heading(cake.data.title, cake.data.subtitle)}
${site.games.map(romSection).join('\n')}
<dialog class="modal" id="fn" aria-labelledby="fn-title">
<div class="modal-head"><h2 id="fn-title"></h2>${CLOSE}</div>
<dl class="spec"></dl>
<div class="fn-body"></div>
<p class="modal-actions"><button type="button" class="step" data-step="-1" aria-label="previous function">‹ prev</button><button type="button" class="step" data-step="1" aria-label="next function">next ›</button><a class="fn-source" target="_blank" rel="noopener">source</a></p>
</dialog>
<script type="module" src="/js/map.js"></script>`),
  );
  out.set(
    'attic/index.html',
    page('/attic/', 'attic', `${heading('my passion projects')}
<ul class="projects"><li><a href="/attic/cake-unbake/"><strong>${escapeHtml(cake.data.title)}</strong></a></li>
<li><a href="/attic/archive/"><strong>archive</strong></a></li></ul>`),
  );
  out.set(
    'attic/archive/index.html',
    page('/attic/archive/', 'archive', `<p class="back"><a href="/attic/">attic</a></p>
${heading('archive')}
<ul class="archive">${archive.map(archiveEntry).join('\n')}</ul>`),
  );

  const years = groupByYear(posts)
    .map((group) => `<section><h2 id="y${group.year}">${group.year}</h2>${postList(group.posts, tagSlug)}</section>`)
    .join('\n');
  const tags = tagIndex(posts);
  out.set(
    'blog/index.html',
    page('/blog/', 'blog', `${heading('blog')}
${tags.length ? `<p>${tagLinks(tags.map((t) => t.tag), tagSlug)}</p>` : ''}
${years || postList([], tagSlug)}
<p class="back"><a href="/blog/feed.xml">rss feed</a></p>`),
  );
  for (const post of posts) {
    out.set(
      `${post.url.slice(1)}index.html`,
      page(
        post.url,
        post.title,
        `${heading(post.title, post.summary)}
<p class="back"><time datetime="${post.date}">${post.date}</time> ${tagLinks(post.tags, tagSlug)}</p>
<article class="prose">${anchorHeadings(marked.parse(post.body))}</article>`,
        { description: post.summary },
      ),
    );
  }
  for (const tag of tags) {
    out.set(
      `blog/tags/${tag.slug}/index.html`,
      page(`/blog/tags/${tag.slug}/`, `#${tag.tag}`, `${heading(`#${tag.tag}`, `${tag.posts.length} post${tag.posts.length === 1 ? '' : 's'}`)}
${postList(tag.posts, tagSlug)}`),
    );
  }
  out.set('blog/feed.xml', rss(site, posts));

  out.set('contact/index.html', page('/contact/', pages.contact.data.title, article(pages.contact, contactForm(site.contact))));
  out.set('404.html', page('/404', pages['404'].data.title, article(pages['404'])));
  return out;
}

async function stylesheet(root) {
  const parts = await Promise.all(STYLES.map((name) => readFile(join(root, 'assets', 'css', name), 'utf8')));
  return parts.join('\n');
}

async function writeSite(root, outDir, files) {
  await rm(outDir, { recursive: true, force: true });
  const write = async (path, content) => {
    const target = join(outDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  const copy = async (from, path) => {
    const target = join(outDir, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(from, target);
  };
  const assets = (await Promise.all(['images', 'js'].map(async (dir) => (await walk(join(root, 'assets', dir))).map((file) => [file, join(dir, relative(join(root, 'assets', dir), file))])))).flat();
  await Promise.all([
    ...[...files].map(([path, content]) => write(path, content)),
    write('css/site.css', await stylesheet(root)),
    copy(join(root, 'assets', 'favicon.ico'), 'favicon.ico'),
    copy(join(root, 'CNAME'), 'CNAME'),
    ...assets.map(([from, path]) => copy(from, path)),
  ]);
}

// Render and write dist/.
export async function build({ root = ROOT, outDir = join(root, 'dist') } = {}) {
  const started = performance.now();
  const content = await loadContent(root);
  const files = renderSite(content);
  await writeSite(root, outDir, files);
  process.stderr.write(`built ${files.size} files in ${(performance.now() - started).toFixed(0)} ms\n`);
  return content;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
