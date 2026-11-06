// Public search data for the GM screen: Rules notes (title, text snippet) and #npc notes.
// Everything here is already public wiki content. No GM state, ever.
const fs = require("fs");
const { normalizeSitePathPrefix } = require("../helpers/sitePath");

const clean = (t) =>
  t
    .replace(/^---[\s\S]*?---/, "")
    .replace(/\[\[([^\]|]*\\?\|)?([^\]]*)\]\]/g, "$2")
    .replace(/<[^>]*>/g, "")
    .replace(/[#*\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

module.exports = class GmIndex {
  data() {
    return { permalink: "/gm-index.json", eleventyExcludeFromCollections: true };
  }

  render(data) {
    const prefix = normalizeSitePathPrefix(process.env.SITE_PATH_PREFIX || "/");
    const withPrefix = (u) => (prefix === "/" ? u : prefix.replace(/\/$/, "") + u);
    const rules = [];
    const npcs = [];
    for (const n of (data.collections && data.collections.note) || []) {
      if (!n.inputPath || !n.url || n.data.hidden) continue;
      let raw;
      try { raw = fs.readFileSync(n.inputPath, "utf8"); } catch { continue; }
      const title = n.data.title || n.fileSlug;
      if (/[\\/]notes[\\/]Rules[\\/]/.test(n.inputPath)) {
        rules.push({ title, url: withPrefix(n.url), text: clean(raw).slice(0, 1500) });
      }
      if (/(^|\s)#npc\b/.test(raw)) npcs.push({ name: title, url: withPrefix(n.url) });
    }
    rules.sort((a, b) => a.title.localeCompare(b.title));
    npcs.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify({ rules, npcs });
  }
};
