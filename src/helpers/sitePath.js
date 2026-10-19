function normalizeSitePathPrefix(value = "/") {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  if (
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[?#]/.test(trimmed)
  ) {
    throw new Error(`Invalid site path prefix: ${value}`);
  }

  const segments = trimmed.split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}/` : "/";
}

function prefixRootRelativeUrl(url, prefix) {
  if (prefix === "/" || !url || !url.startsWith("/") || url.startsWith("//")) {
    return url;
  }

  const suffixStart = url.search(/[?#]/);
  const pathname = suffixStart === -1 ? url : url.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : url.slice(suffixStart);
  const prefixWithoutTrailingSlash = prefix.slice(0, -1);

  if (pathname === prefixWithoutTrailingSlash) {
    return `${prefix}${suffix}`;
  }
  if (pathname.startsWith(prefix)) return url;

  return `${prefix}${url.slice(1)}`;
}

function prefixHtmlRootUrls(html, prefix) {
  if (prefix === "/") return html;

  return html.replace(
    /\b(href|src|action|formaction|poster|cite|background|data-src|data-href|xlink:href|srcset|imagesrcset)(\s*=\s*)(["'])(\/(?!\/)[^"']*)\3/gi,
    (match, attribute, separator, quote, value) => {
      const prefixedValue =
        attribute.toLowerCase() === "srcset" ||
        attribute.toLowerCase() === "imagesrcset"
          ? value.replace(
              /(^|,\s*)(\/(?!\/)[^\s,]+)/g,
              (srcsetMatch, delimiter, url) =>
                `${delimiter}${prefixRootRelativeUrl(url, prefix)}`
            )
          : prefixRootRelativeUrl(value, prefix);
      return `${attribute}${separator}${quote}${prefixedValue}${quote}`;
    }
  );
}

function prefixManifestIcons(manifest, prefix) {
  if (prefix === "/" || !Array.isArray(manifest.icons)) return manifest;

  return {
    ...manifest,
    icons: manifest.icons.map((icon) => ({
      ...icon,
      src: prefixRootRelativeUrl(icon.src, prefix),
    })),
  };
}

module.exports = {
  normalizeSitePathPrefix,
  prefixHtmlRootUrls,
  prefixManifestIcons,
  prefixRootRelativeUrl,
};
