const fs = require("fs");
const path = require("path");
require("dotenv").config();
const {
  normalizeSitePathPrefix,
  prefixRootRelativeUrl,
} = require("../src/helpers/sitePath");

const prefix = normalizeSitePathPrefix(process.env.SITE_PATH_PREFIX || "/");
const outputDir = path.resolve("dist");
const indexPath = path.join(outputDir, "index.html");

if (!fs.existsSync(indexPath)) {
  throw new Error("The Pages build did not produce dist/index.html");
}

const html = fs.readFileSync(indexPath, "utf8");
if (!html.includes("cm-s-obsidian")) {
  throw new Error("dist/index.html is not a generated Digital Garden page");
}
if (html.includes("Jekyll v")) {
  throw new Error("dist/index.html contains Jekyll output instead of the garden");
}

const themeStylesheets = Array.from(
  html.matchAll(/href=["']([^"']*\/styles\/(?:style|_theme[^/]*|obsidian-base)\.css[^"']*)["']/g),
  (match) => match[1]
);
if (themeStylesheets.length === 0) {
  throw new Error("The home page does not link a theme stylesheet");
}

if (
  process.env.THEME &&
  !themeStylesheets.some((stylesheet) => /\/_theme\.[^/]+\.css(?:[?#]|$)/.test(stylesheet))
) {
  throw new Error(
    "THEME is configured, but the generated page does not link its downloaded theme stylesheet"
  );
}

for (const stylesheet of themeStylesheets) {
  const expectedUrl = prefixRootRelativeUrl(
    stylesheet.startsWith(prefix) ? stylesheet.slice(prefix.length - 1) : stylesheet,
    prefix
  );
  if (stylesheet !== expectedUrl) {
    throw new Error(`Theme stylesheet is missing the site prefix: ${stylesheet}`);
  }

  const relativePath = stylesheet
    .slice(prefix.length - 1)
    .split(/[?#]/, 1)[0]
    .replace(/^\/+/, "");
  if (!fs.existsSync(path.join(outputDir, relativePath))) {
    throw new Error(`Theme stylesheet is missing from dist: ${relativePath}`);
  }
}

for (const asset of [
  "styles/digital-garden-base.css",
  "styles/custom-style.css",
]) {
  if (!fs.existsSync(path.join(outputDir, asset))) {
    throw new Error(`Required site stylesheet is missing from dist: ${asset}`);
  }
  if (!html.includes(`${prefix}${asset}`)) {
    throw new Error(`Home page does not reference ${prefix}${asset}`);
  }
}

function findHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
  });
}

const urlAttributePattern =
  /\b(href|src|action|formaction|poster|cite|background|data-src|data-href|xlink:href|srcset|imagesrcset)(\s*=\s*)(["'])(\/(?!\/)[^"']*)\3/gi;

for (const htmlFile of findHtmlFiles(outputDir)) {
  const pageHtml = fs.readFileSync(htmlFile, "utf8");
  for (const match of pageHtml.matchAll(urlAttributePattern)) {
    const attribute = match[1].toLowerCase();
    const urls =
      attribute === "srcset" || attribute === "imagesrcset"
        ? Array.from(
            match[4].matchAll(/(^|,\s*)(\/(?!\/)[^\s,]+)/g),
            (srcsetMatch) => srcsetMatch[2]
          )
        : [match[4]];
    for (const url of urls) {
      if (url !== prefixRootRelativeUrl(url, prefix)) {
        throw new Error(
          `Unprefixed local URL in ${path.relative(outputDir, htmlFile)}: ${url}`
        );
      }
    }
  }
}

const digitalGardenStylesheet = fs.readFileSync(
  path.join(outputDir, "styles/digital-garden-base.css"),
  "utf8"
);
if (/url\(\s*["']?\/(?!\/)/i.test(digitalGardenStylesheet)) {
  throw new Error("Digital Garden CSS contains a root-relative asset URL");
}

const manifestPath = path.join(outputDir, "manifest.webmanifest");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const icon of manifest.icons || []) {
    if (prefix !== "/" && !icon.src.startsWith(prefix)) {
      throw new Error(`Manifest icon is missing the site prefix: ${icon.src}`);
    }

    const relativePath = icon.src
      .slice(prefix === "/" ? 0 : prefix.length)
      .split(/[?#]/, 1)[0]
      .replace(/^\/+/, "");
    if (!fs.existsSync(path.join(outputDir, relativePath))) {
      throw new Error(`Manifest icon is missing from dist: ${relativePath}`);
    }
  }
}

console.log(`Verified Digital Garden output and theme assets at ${prefix}`);
