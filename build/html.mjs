// HTML templates for the Index design: every page sits beside an alphabetical, book-style index.
// Layout class names follow AtomUI atoms (container, axis-row, axis-column, wrap, gap-N, table, button, choice, text-input).

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Give every h2 an id so the index can point into pages.
export function anchorHeadings(html) {
  return html.replace(/<h2>([\s\S]*?)<\/h2>/g, (all, text) => `<h2 id="${slugify(text.replace(/<[^>]+>/g, ''))}">${text}</h2>`);
}

// Top-level entries keep their given order, as plain labels.
// Each entry's own sections nest under it in their given order. The current page is marked.
export function bookIndex(entries, path) {
  const current = (href, exact) => {
    const page = href.split('#')[0];
    return exact || page === '/' ? page === path : path.startsWith(page);
  };
  const items = entries
    .map(({ label, href, children = [] }) => {
      const nested = children
        .map((c) => `<li><a href="${e(c.href)}"${c.modal ? ` data-modal="${e(c.modal)}"` : ''}${!c.modal && !c.href.includes('#') && current(c.href, true) ? ' aria-current="page"' : ''}>${e(c.label)}</a></li>`)
        .join('');
      return `<li><span class="entry"><a href="${e(href)}"${current(href) ? ' aria-current="page"' : ''}>${e(label)}</a>${nested ? `<ul>${nested}</ul>` : ''}</span></li>`;
    })
    .join('');
  return `<ul class="entries">${items}</ul>`;
}

// Theme: the system preference until the reader clicks the toggle, then the stored choice. The head script
// sets it before the first paint; storage may be missing, so both scripts work without it.
const THEME_HEAD = "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";
const THEME_TOGGLE = `(function(){var r=document.documentElement,b=document.querySelector('.theme-toggle');if(!b)return;
var dark=function(){return r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches};
var show=function(){var l=dark()?'switch to light theme':'switch to dark theme';b.setAttribute('aria-label',l);b.title=l};
b.addEventListener('click',function(){var t=dark()?'light':'dark';r.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}show()});
b.hidden=false;show()})();`;
// Links with data-modal open that dialog in place; without script they follow their href. Esc and the close
// button close it, as does a click on the backdrop. The resume frame loads on first open, not with every page.
const MODALS = `(function(){document.addEventListener('click',function(ev){var a=ev.target.closest('[data-modal]');if(a){var d=document.getElementById(a.dataset.modal);
if(!d||!d.showModal)return;ev.preventDefault();var f=d.querySelector('iframe[data-src]');if(f&&!f.src)f.src=f.dataset.src;d.showModal();return}
var t=ev.target;if(t.tagName==='DIALOG'&&t.open){var b=t.getBoundingClientRect();if(ev.clientX<b.left||ev.clientX>b.right||ev.clientY<b.top||ev.clientY>b.bottom)t.close()}})})();`;

export const CLOSE = '<form method="dialog"><button class="close" type="submit" aria-label="close">close</button></form>';

export function resumeUrl(resume) {
  return `https://drive.google.com/file/d/${resume.drive}/view`;
}

function resumeDialog(resume) {
  if (!resume) return '';
  const file = `https://drive.google.com/file/d/${e(resume.drive)}`;
  return `<dialog class="modal" id="resume" aria-labelledby="resume-title">
<div class="modal-head"><h2 id="resume-title">my resume</h2>${CLOSE}</div>
<p class="note">last updated ${e(resume.updated)}</p>
<iframe data-src="${file}/preview" title="resume"></iframe>
<p class="modal-actions"><a href="${file}/view" target="_blank" rel="noopener">open pdf to print</a><a href="https://drive.google.com/uc?export=download&amp;id=${e(resume.drive)}">download pdf</a></p>
</dialog>`;
}

// A circle, half filled: one glyph for both themes.
const THEME_GLYPH = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg>';

export function layout(site, { title, path, description, body, index }) {
  const fullTitle = title ? `${title} | ${site.title}` : site.title;
  const links = site.links.map((link) => `<a href="${e(link.href)}">${e(link.label)}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<script>${THEME_HEAD}</script>
<title>${e(fullTitle)}</title>
<meta name="description" content="${e(description || site.tagline)}">
<link rel="icon" href="/favicon.ico">
<link rel="alternate" type="application/rss+xml" title="${e(site.title)}" href="/blog/feed.xml">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<div class="book">
<nav class="index" aria-label="index">
<div class="brand"><a class="name" href="/">${e(site.handle)}<span class="caret" aria-hidden="true">_</span></a><button class="theme-toggle" type="button" aria-label="switch theme" title="switch theme" hidden>${THEME_GLYPH}</button></div>
<p class="role">${e(site.tagline)}</p>
${bookIndex(index, path)}
<p class="links">${links}<a href="/blog/feed.xml">rss</a></p>
</nav>
<main class="page">
${body}
</main>
</div>
${resumeDialog(site.resume)}
<script>${THEME_TOGGLE}${MODALS}</script>
</body>
</html>
`;
}

export function heading(title, subtitle) {
  return `<header class="page-head"><h1>${e(title)}</h1>${subtitle ? `<p class="sub">${e(subtitle)}</p>` : ''}</header>`;
}

export function tagLinks(tags, tagSlug) {
  if (!tags.length) return '';
  return `<span class="tags">${tags.map((tag) => `<a href="/blog/tags/${tagSlug(tag)}/">#${e(tag)}</a>`).join(' ')}</span>`;
}

export function postList(posts, tagSlug, empty = 'no posts yet.') {
  if (!posts.length) return `<p class="sub">${empty}</p>`;
  return `<ul class="posts">${posts
    .map(
      (post) => `<li><time datetime="${post.date}">${post.date}</time><span><a href="${post.url}">${e(post.title)}</a><span class="sub">${e(post.summary)}</span>${tagLinks(post.tags, tagSlug)}</span></li>`,
    )
    .join('\n')}</ul>`;
}
