const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const matterOptions = require("../../helpers/matterOptions");
const { cachedSlugify } = require("../../helpers/utils");
const { buildNewsItems } = require("../../helpers/newsData");
const stockTicker = require("./stockTicker");

// Build-time source for the news ticker row: every published note tagged
// #news whose in-world article month matches the stock ticker snapshot month.
const NOTES_DIR = path.join(__dirname, "..", "notes");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

// Mirrors the permalink logic used for rendered notes so headline links match.
function noteUrl(filePath, frontMatter) {
  const fileName = path.relative(NOTES_DIR, filePath).replace(/\\/g, "/").replace(/\.md$/, "");
  let permalink = frontMatter.data.permalink || `/notes/${cachedSlugify(fileName)}`;
  if (frontMatter.data.tags && frontMatter.data.tags.indexOf("gardenEntry") !== -1) {
    permalink = "/";
  }
  return permalink;
}

const notes = walk(NOTES_DIR)
  .map((filePath) => {
    const frontMatter = matter(fs.readFileSync(filePath, "utf8"), matterOptions);
    return { filePath, frontMatter };
  })
  .filter(({ frontMatter }) => frontMatter.data["dg-publish"] === true)
  .map(({ filePath, frontMatter }) => ({
    inputPath: filePath,
    url: noteUrl(filePath, frontMatter),
  }));

const items = buildNewsItems(notes).filter(
  (item) =>
    item.articleTimestamp !== null &&
    item.articleTimestamp === stockTicker.monthTimestamp
);

module.exports = { monthLabel: stockTicker.monthLabel, items };
