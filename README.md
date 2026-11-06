# G-man's Cyberpunk

Cyberpunk TTRPG campaign wiki: Night City setting, the current Fourth Corporate
War campaign, past adventures (including Eurotour), factions, maps and rules.

Live site: <https://aj-gman.github.io/cyberpunk/>

## Stack and deployment

- Eleventy + the [Digital Garden](https://github.com/oleeskild/Obsidian-Digital-Garden) Obsidian plugin.
- The static site deploys to **GitHub Pages** on every push to `main`
  (`.github/workflows/pages.yml`), served under the `/cyberpunk/` path prefix.
- **Vercel** hosts only the serverless character-save API (`api/`); the sheets
  reach it through the generated `img/api-config.js`.
- Pull requests run tests and a full build check (`.github/workflows/pr-build.yml`).
- Agent instructions for working in this repo: [AGENTS.md](AGENTS.md).

## Content workflow

Notes are written in Obsidian and published with the Digital Garden plugin
into `src/site/notes/`. Site source lives in `src/site/`; `dist/` is generated
output and is never edited.

## Character sheets

- `src/site/img/NCO-sheet.html` — NCOverdrive sheet, the one used in play.
  Cloud saves go through `api/character.js` into `characters/`.
- `src/site/img/CPRED-sheet.html` — CPRED sheet (legacy). Cloud saves go
  through `api/save-character.js` / `api/load-character.js` into `saves/`.

## Map viewer

`src/site/img/map-viewer/` — political, socioeconomic and influence map layers
with a month timeline.

## Commands

```sh
npm ci
npm run dev        # local dev server
npm test           # vitest suite
SITE_BASE_URL=https://aj-gman.github.io SITE_PATH_PREFIX=/cyberpunk/ npm run build
SITE_PATH_PREFIX=/cyberpunk/ node scripts/verify-pages-build.js
```

## Configuration

`site.env` holds the tracked, non-secret site settings loaded at build time.
`.env` is gitignored and only needed for local overrides or secrets; see
`.env.example` for the available keys. `SHEET_API_BASE` sets the sheets'
cloud-save API base URL (default: the current Vercel deployment).

## Docs

- [docs/NCO-IMPLEMENTATION.md](docs/NCO-IMPLEMENTATION.md) — scope and
  verification notes for the NCO sheet fixes, including the deferred
  authentication item for cloud saves.
