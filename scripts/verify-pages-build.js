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
const legacyHost = "gman-cyberpunk.vercel.app";
const characterApiUrl = `https://${legacyHost}/api/character`;

if (!fs.existsSync(indexPath)) {
  throw new Error("The Pages build did not produce dist/index.html");
}

const html = fs.readFileSync(indexPath, "utf8");
if (!html.includes('class="hero"')) {
  throw new Error("dist/index.html is not the configured glitch-header front page");
}
if (html.includes(legacyHost)) {
  throw new Error("The glitch-header homepage still links to the old Vercel site");
}
for (const href of [
  `${prefix}img/map-viewer/`,
  `${prefix}img/NCO-sheet.html`,
  `${prefix}ai-policy/`,
]) {
  if (!html.includes(`href="${href}"`)) {
    throw new Error(`The glitch-header homepage is missing its local link to ${href}`);
  }
}
if (html.includes("Jekyll v")) {
  throw new Error("dist/index.html contains Jekyll output instead of the garden");
}

const searchIndexPath = path.join(outputDir, "searchIndex.json");
if (!fs.existsSync(searchIndexPath)) {
  throw new Error("The Pages build did not produce dist/searchIndex.json");
}
const searchIndex = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
if (!Array.isArray(searchIndex)) {
  throw new Error("dist/searchIndex.json must contain an array of search results");
}
for (const result of searchIndex) {
  if (
    !result ||
    typeof result.url !== "string" ||
    result.url !== prefixRootRelativeUrl(result.url, prefix)
  ) {
    throw new Error(`Search result URL is missing the site prefix: ${result.url}`);
  }
}

function findHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
  });
}

const gardenPages = findHtmlFiles(outputDir)
  .filter((file) => file !== indexPath)
  .map((file) => ({
    file,
    html: fs.readFileSync(file, "utf8"),
  }))
  .filter(({ html }) => html.includes("cm-s-obsidian"));
if (gardenPages.length === 0) {
  throw new Error("The Pages build did not produce any Digital Garden note pages");
}

const gardenPagePath = path
  .relative(outputDir, gardenPages[0].file)
  .split(path.sep)
  .map(encodeURIComponent)
  .join("/")
  .replace(/(^|\/)index\.html$/, "$1");

for (const { file, html: pageHtml } of gardenPages) {
  if (!pageHtml.includes(`href="${prefix}ai-policy/"`)) {
    throw new Error(
      `AI policy footer link is not local in ${path.relative(outputDir, file)}`
    );
  }
}

const themeStylesheets = Array.from(
  gardenPages.flatMap(({ html }) =>
    Array.from(
      html.matchAll(
        /href=["']([^"']*\/styles\/(?:style|_theme[^/]*|obsidian-base)\.css[^"']*)["']/g
      ),
      (match) => match[1]
    )
  )
);
if (themeStylesheets.length === 0) {
  throw new Error("Digital Garden note pages do not link a theme stylesheet");
}

if (
  process.env.THEME &&
  !themeStylesheets.some((stylesheet) =>
    /\/_theme\.[^/]+\.css(?:[?#]|$)/.test(stylesheet)
  )
) {
  throw new Error(
    "THEME is configured, but no Digital Garden note page links its downloaded theme stylesheet"
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

for (const asset of ["styles/digital-garden-base.css", "styles/custom-style.css"]) {
  if (!fs.existsSync(path.join(outputDir, asset))) {
    throw new Error(`Required site stylesheet is missing from dist: ${asset}`);
  }
  if (!gardenPages.some(({ html }) => html.includes(`${prefix}${asset}`))) {
    throw new Error(`Digital Garden note pages do not reference ${prefix}${asset}`);
  }
}

const urlAttributePattern =
  /\b(href|src|action|formaction|poster|cite|background|data-src|data-href|xlink:href|srcset|imagesrcset)(\s*=\s*)(["'])(\/(?!\/)[^"']*)\3/gi;

for (const htmlFile of findHtmlFiles(outputDir)) {
  const pageHtml = fs.readFileSync(htmlFile, "utf8");
  const htmlWithoutCharacterApi = pageHtml.replaceAll(characterApiUrl, "");
  if (htmlWithoutCharacterApi.includes(legacyHost)) {
    throw new Error(
      `A generated page still references the old site: ${path.relative(outputDir, htmlFile)}`
    );
  }
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

const overdriveSheetPath = path.join(outputDir, "img/NCO-sheet.html");
if (
  !fs.existsSync(overdriveSheetPath) ||
  !fs.readFileSync(overdriveSheetPath, "utf8").includes(characterApiUrl)
) {
  throw new Error("The NCO sheet is missing its Vercel cloud-save API endpoint");
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

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `garden_page_path=${gardenPagePath}\n`
  );
}

console.log(
  `Verified glitch-header homepage, Digital Garden theme assets, and path prefix ${prefix}`
);
