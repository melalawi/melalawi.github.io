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

The attic page cake unbake holds no numbers. In the browser each ROM section reads its repo's `progress.json` (schema 2) from main: the numbers for every version, and for the default version the memory map (functions, data and platform spans, blobs). Every ROM byte is one of code, data, platform, blobs or unknown, and the page rejects a file whose layers do not add up to `rom_size`. Five checkboxes under the map show or hide those layers (all on at first); the choice is kept in the browser under `cake:layers`. The last good copy of the file stays in the browser and shows when a fetch fails. At build time the cartridge ID is checked against the repo README's totals.

## Deploy

A push to `main` runs one GitHub Actions workflow that tests, builds and publishes to Pages.
