const fs = require("fs");
const path = require("path");

/**
 * Strip Obsidian wikilinks to their display text.
 * [[Path|Display]] → Display
 * [[Path]]         → Path (last segment)
 */
function stripWikilinks(text) {
  return text
    .replace(/\[\[[^\]]*?\|([^\]]+?)\]\]/g, "$1")  // [[foo|bar]] → bar
    .replace(/\[\[([^\]]+?)\]\]/g, (_, p) => {
      // [[foo]] → last path segment
      const parts = p.split("/");
      return parts[parts.length - 1];
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")        // [text](url) → text
    .replace(/\[\^\d+\]/g, "");                      // strip footnote refs
}

module.exports = () => {
  const chroniclePath = path.join(__dirname, "../notes/z-SITE/Site Chronicle.md");
  const raw = fs.readFileSync(chroniclePath, "utf8");

  const entries = [];
  let currentMonth = "";

  const lines = raw.split(/\r?\n/);
  let currentDay = null;
  let currentDayMonth = "";
  let currentItems = [];

  for (const line of lines) {
    const monthMatch = line.match(/^###\s+(.+?)\s*$/);
    if (monthMatch) {
      currentMonth = monthMatch[1].trim();
      continue;
    }

    const dayMatch = line.match(/^####\s+(.+?)\s*$/);
    if (dayMatch) {
      // Save previous entry
      if (currentDay && currentItems.length > 0) {
        entries.push({
          month: currentDayMonth,
          day: currentDay,
          items: currentItems,
        });
      }
      currentDay = dayMatch[1].trim();
      currentDayMonth = currentMonth;
      currentItems = [];
      continue;
    }

    if (currentDay) {
      const bulletMatch = line.match(/^\t*[-*]\s+(.+)$/);
      if (bulletMatch) {
        currentItems.push(stripWikilinks(bulletMatch[1].trim()));
      }
    }
  }

  // Push last entry
  if (currentDay && currentItems.length > 0) {
    entries.push({
      month: currentDayMonth,
      day: currentDay,
      items: currentItems,
    });
  }

  // Return the most recent 3 entries
  return entries.slice(0, 3);
};