function userMarkdownSetup(md) {
  // The md parameter stands for the markdown-it instance used throughout the site generator.
  // Feel free to add any plugin you want here instead of /.eleventy.js
}
function userEleventySetup(eleventyConfig) {
  // The eleventyConfig parameter stands for the the config instantiated in /.eleventy.js.
  // Feel free to add any plugin you want here instead of /.eleventy.js

  // --- Favicon generation (survives template updates) ---
  // Serialized, lock-retrying wrapper around eleventy-plugin-gen-favicons.
  // Fixes EBUSY on Windows when pages copy dist/favicon.svg concurrently.
  const { serializedFaviconsPlugin } = require("../site/normalize-favicon.js");
  eleventyConfig.addPlugin(serializedFaviconsPlugin, { outputDir: "dist" });

  // --- Permanent tag fixes (survive template updates) ---

  // Strip leading '#' from tag values. The Obsidian DG plugin outputs tags with
  // '#' in JSON frontmatter (e.g. "#gig"), but the template hardcodes '#' when
  // displaying them, producing "##gig" without this filter.
  eleventyConfig.addFilter("cleanTag", function (tag) {
    return typeof tag === "string" && tag.startsWith("#") ? tag.slice(1) : tag;
  });

  // Taggify that skips tags already rendered in the page header. Accepts the
  // page's frontmatter `tags` value so it can skip duplicates.
  const TAG_REGEX = /(^|\s|\>)(#[^\s!@#$%^&*()=+\.,\[{\]};:'"?\><]+)(?!([^<]*>))/g;
  eleventyConfig.addFilter("taggifyNoDup", function (str, frontmatterTags) {
    if (!str) return str;
    // Normalize tags to an array regardless of whether it's a string or array.
    var tags = frontmatterTags;
    if (!Array.isArray(tags)) {
      tags = typeof tags === "string" ? [tags] : [];
    }
    var existing = new Set(
      tags
        .map(function (t) { return String(t).replace(/^#/, "").toLowerCase(); })
    );
    return str.replace(TAG_REGEX, function (match, precede, tag) {
      var name = tag.replace(/^#/, "").toLowerCase();
      if (existing.has(name)) return match; // already shown in header
      return precede + '<a class="tag" data-content="' + tag + '">' + tag + '</a>';
    });
  });
}
exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
