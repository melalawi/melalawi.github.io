// Blog posts live at posts/YYYY/MM-DD-slug.md with title, date, tags and summary front matter, and optionally
// `updated`, the date the post was last edited (the date itself when absent). Tags only reach the feed.
import { parse as parseYaml } from 'yaml';

const POST_PATH = /^(\d{4})\/(\d{2})-(\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;

export function splitFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: parseYaml(match[1]) || {}, body: match[2] };
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// One post from its path relative to posts/ and its file text.
export function parsePost(relativePath, text) {
  const path = relativePath.split('\\').join('/');
  const match = POST_PATH.exec(path);
  if (!match) throw new Error(`${path}: expected YYYY/MM-DD-slug.md`);
  const [, year, month, day, slug] = match;
  const { data, body } = splitFrontMatter(text);
  for (const key of ['title', 'date', 'summary']) {
    if (data[key] === undefined || data[key] === '') throw new Error(`${path}: missing ${key}`);
  }
  const date = isoDate(data.date);
  if (date !== `${year}-${month}-${day}`) {
    throw new Error(`${path}: date ${date} does not match the file name`);
  }
  const tags = [...new Set((data.tags || []).map(String))].sort();
  const updated = data.updated === undefined ? date : isoDate(data.updated);
  if (updated < date) throw new Error(`${path}: updated ${updated} is before its date`);
  return {
    title: String(data.title),
    date,
    updated,
    year,
    slug,
    summary: String(data.summary),
    tags,
    url: `/blog/${year}/${month}-${day}-${slug}/`,
    body,
  };
}

// Newest first. Same-day posts fall back to slug order so builds are stable.
export function sortPosts(posts) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function groupByYear(posts) {
  const years = new Map();
  for (const post of sortPosts(posts)) {
    if (!years.has(post.year)) years.set(post.year, []);
    years.get(post.year).push(post);
  }
  return [...years.entries()].map(([year, items]) => ({ year, posts: items }));
}

