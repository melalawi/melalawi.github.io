import { escapeHtml } from './html.mjs';

export function rss(site, posts) {
  const items = posts
    .map(
      (post) => `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${site.url}${post.url}</link>
      <guid>${site.url}${post.url}</guid>
      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeHtml(post.summary)}</description>
${post.tags.map((tag) => `      <category>${escapeHtml(tag)}</category>`).join('\n')}
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(site.title)}</title>
    <link>${site.url}/blog/</link>
    <description>${escapeHtml(site.title)} blog</description>
${items}
  </channel>
</rss>
`;
}
