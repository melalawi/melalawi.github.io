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
- Site facts, the ROM repos and the Cloudflare Web Analytics token are in `site.json`.
- Type is the reader's own book serif everywhere, so the site loads no web fonts.

## cake unbake

The attic page cake unbake holds no numbers. In the browser each ROM section reads its repo's `progress.json` (schema 2) from main. A tab per version (the game's default from `site.json` first) shows that version's ROM breakdown, its numbers and its memory map (code only), which it reads from that version's `docs/map-<version>.json` when the tab is first shown. The numbers start with the ROM size and list its parts under it: the header block (cartridge header and boot code, which opens the parsed header fields, never header bytes), code, data and blobs, then the functions. What no part covers is the empty rest of the ROM bar, never a number. The last good copy of `progress.json` stays in the browser and shows when a fetch fails. At build time the cartridge ID and totals are checked against the repo README's ROM tree.

## Deploy

A push to `main` runs one GitHub Actions workflow that tests, builds and publishes to Pages.
