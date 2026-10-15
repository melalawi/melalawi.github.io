# itsmo.me

My personal site. It is plain static HTML built from markdown.

## Build

Node 22 or newer.

```sh
npm ci
npm test
npm run build
npm run dev
```

The build writes `dist/`. The dev server binds every interface on port 4380 or the next free one and rebuilds when content changes.

## Writing

- Posts go in `posts/YYYY/MM-DD-slug.md` with `title`, `date`, `tags` and `summary` front matter.
- Pages live in `content/`.
- Archive entries are one file each in `content/archive/`.
- Site facts and the ROM repos are in `site.json`.
- Type is the reader's own book serif everywhere, so the site loads no web fonts.

## cake unbake

The attic page cake unbake holds no numbers. In the browser each ROM section reads its repo's `progress.json` from main, and once the figure nears the screen it reads the memory map SVG and `symbols.json` for the source links. The last good copy of each file stays in the browser and shows when a fetch fails.

## Deploy

A push to `main` runs one GitHub Actions workflow that tests, builds and publishes to Pages.
