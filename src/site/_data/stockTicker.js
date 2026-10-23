const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
// Same frontmatter engine .eleventy.js uses when resolving wikilinks.
const matterOptions = require("../../helpers/matterOptions");
const { cachedSlugify, headerToId } = require("../../helpers/utils");

// Build-time source for the stock ticker. Any mismatch throws, which fails the build.
const NOTES_DIR = path.join(__dirname, "..", "notes");
const STOCK_SOURCE = path.join(NOTES_DIR, "Night City", "Organizations", "Corporations", "!stock.md");
const HEADING_RE = /^\*\*Ticker snapshot\s*:?\s*\(?\s*(.+?)\s*\)?\*\*$/i;
const WIKILINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
const NUMBER_RE = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)/;

function fail(message) {
  throw new Error(`[stockTicker] ${message}`);
}

// Mirrors computeAnchorAttributes() in .eleventy.js so ticker links match rendered wikilinks.
// Unresolved targets fall back to /404, as rendered wikilinks do.
function resolveHref(target) {
  const [fileName, header] = target.split("#");
  const fragment = header === undefined ? "" : `#${headerToId(header)}`;
  const fileRef =
    fileName.endsWith(".md") || fileName.endsWith(".canvas") ? fileName : `${fileName}.md`;
  try {
    const frontMatter = matter(fs.readFileSync(path.join(NOTES_DIR, fileRef), "utf8"), matterOptions);
    let permalink = frontMatter.data.permalink || `/notes/${cachedSlugify(fileName)}`;
    if (frontMatter.data.tags && frontMatter.data.tags.indexOf("gardenEntry") !== -1) {
      permalink = "/";
    }
    return `${permalink}${fragment}`;
  } catch {
    return "/404";
  }
}

function parseChange(text, label) {
  const match = text.match(NUMBER_RE);
  if (!match) fail(`no numeric change for "${label}"`);
  const value = match[0];
  const number = Number(value);
  const direction = number > 0 ? "positive" : number < 0 ? "negative" : "neutral";
  const amount =
    direction === "neutral"
      ? "0"
      : direction === "positive" && !value.startsWith("+")
        ? `+${value}`
        : value;
  return { amount, direction };
}

// Obsidian escapes pipes inside wikilinks as \|, so those must not split cells.
function splitRow(line) {
  return line
    .replace(/\\\|/g, "\u0000")
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.replaceAll("\u0000", "|").trim());
}

function parseStockSource(source) {
  const lines = matter(source, matterOptions).content.split(/\r?\n/);

  const headingIndex = lines.findIndex((line) => HEADING_RE.test(line.trim()));
  if (headingIndex < 0) fail('missing "Ticker snapshot" heading');
  const timestamp = lines[headingIndex].trim().match(HEADING_RE)[1].trim().toUpperCase();

  let i = headingIndex + 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  const tableLines = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    tableLines.push(lines[i].trim());
    i++;
  }
  if (tableLines.length < 3) fail("snapshot table is missing or has no rows");
  if (!/^\|?\s*:?-+/.test(tableLines[1])) fail("snapshot table separator row is malformed");

  const headers = splitRow(tableLines[0]).map((header) => header.toLowerCase());
  const tickerIndex = headers.indexOf("ticker");
  const changeIndex = headers.findIndex((header) => header.includes("change"));
  if (tickerIndex < 0 || changeIndex < 0) fail('table needs "Ticker" and "Change" columns');

  const items = tableLines.slice(2).map((line) => {
    const cells = splitRow(line);
    if (cells.length !== headers.length) {
      fail(`row has ${cells.length} cells, expected ${headers.length}: ${line}`);
    }
    const link = cells[tickerIndex].match(WIKILINK_RE);
    if (!link) fail(`ticker cell is not a wikilink: ${cells[tickerIndex]}`);
    const target = link[1].trim();
    const ticker = (link[2] ?? target).trim();
    return { ticker, href: resolveHref(target), ...parseChange(cells[changeIndex], ticker) };
  });

  return { timestamp, items };
}

module.exports = parseStockSource(fs.readFileSync(STOCK_SOURCE, "utf8"));
