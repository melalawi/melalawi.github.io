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

The attic page cake unbake reads each ROM's public `report.json`, `config.toml` and README at build time. It recalculates the totals and the build fails when they disagree with the report's own measures or the README progress rows. The memory map is plain HTML. The only script is the light, dark or system theme switch, and the site works without it.

## Deploy

A push to `main` runs one GitHub Actions workflow that tests, builds and publishes to Pages. It also runs daily so the ROM totals stay fresh.
