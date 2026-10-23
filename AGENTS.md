# Website Structure

- This repository is a static Eleventy (11ty) / Digital Garden site that publishes Obsidian-exported notes.
- Eleventy reads website source from `src/site/` and writes generated output to `dist/`. Treat `dist/` as generated output; make website changes in source files, not there.
- Published notes live under `src/site/notes/`. Their shared page templates are `src/site/_includes/layouts/note.njk` and `src/site/_includes/layouts/index.njk`; `src/site/notes/notes.11tydata.js` selects between them (`gardenEntry` uses the index layout).
- Both shared layouts include `src/site/_includes/components/pageheader.njk` for common head assets and `src/site/_includes/components/navbar.njk` for navigation. Use these shared includes for site-wide head or navigation changes where applicable.
- Not every HTML page uses those shared layouts: inspect standalone templates such as `src/site/404.njk` and `src/site/_includes/layouts/random.njk` when a change must cover every page.
- Browser scripts belong in `src/site/scripts/`; `.eleventy.js` already copies that directory to the output. Site SCSS is in `src/site/styles/` and is compiled by the Sass build to `dist/styles/`.
- Theme styles expose Obsidian variables such as `--background-primary`, `--background-secondary`, and `--text-normal`; prefer these for theme-compatible additions.
- Keep website-only features in website source/assets. Do not edit generated output or external Obsidian vault files.
