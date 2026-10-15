import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByYear, parsePost, sortPosts, tagIndex, tagSlug } from '../build/blog.mjs';
import { rss } from '../build/rss.mjs';

const text = (date, tags = '[]', summary = 'One line.') =>
  `---\ntitle: A <post>\ndate: ${date}\ntags: ${tags}\nsummary: ${summary}\n---\nBody.\n`;

test('parsePost reads front matter and builds the url from the path', () => {
  const post = parsePost('2026/10-14-hello-world.md', text('2026-10-14', '[decomp, N64, decomp]'));
  assert.equal(post.title, 'A <post>');
  assert.equal(post.url, '/blog/2026/10-14-hello-world/');
  assert.deepEqual(post.tags, ['N64', 'decomp']);
  assert.equal(post.body, 'Body.\n');
});

test('parsePost rejects bad paths, missing fields and mismatched dates', () => {
  assert.throws(() => parsePost('2026/hello.md', text('2026-10-14')), /YYYY\/MM-DD-slug/);
  assert.throws(() => parsePost('2026/10-14-a.md', text('2026-10-15')), /does not match/);
  assert.throws(() => parsePost('2026/10-14-a.md', '---\ntitle: x\ndate: 2026-10-14\n---\n'), /missing summary/);
});

const posts = [
  parsePost('2025/12-31-old.md', text('2025-12-31', '[retro]')),
  parsePost('2026/03-01-b.md', text('2026-03-01', '[Decomp, retro]')),
  parsePost('2026/03-01-a.md', text('2026-03-01', '[decomp]')),
  parsePost('2026/10-14-new.md', text('2026-10-14')),
];

test('sortPosts is newest first with slug order on the same day', () => {
  assert.deepEqual(sortPosts(posts).map((p) => p.slug), ['new', 'a', 'b', 'old']);
});

test('groupByYear keeps years newest first', () => {
  assert.deepEqual(
    groupByYear(posts).map((g) => [g.year, g.posts.map((p) => p.slug)]),
    [
      ['2026', ['new', 'a', 'b']],
      ['2025', ['old']],
    ],
  );
});

test('tagIndex merges tags by slug and lists posts newest first', () => {
  assert.equal(tagSlug('C++ / N64'), 'c-n64');
  assert.deepEqual(
    tagIndex(posts).map((t) => [t.slug, t.posts.map((p) => p.slug)]),
    [
      ['decomp', ['a', 'b']],
      ['retro', ['b', 'old']],
    ],
  );
});

test('rss escapes titles and keeps post order', () => {
  const xml = rss({ title: 'Site', url: 'https://example.test' }, sortPosts(posts));
  assert.match(xml, /<title>A &lt;post&gt;<\/title>/);
  assert.ok(xml.indexOf('10-14-new') < xml.indexOf('12-31-old'));
  assert.match(xml, /<category>retro<\/category>/);
});
