import { describe, expect, it } from "vitest";

const {
  normalizeSitePathPrefix,
  prefixHtmlRootUrls,
  prefixManifestIcons,
  prefixRootRelativeUrl,
} = require("../sitePath");

describe("normalizeSitePathPrefix", () => {
  it("normalizes a project-site prefix", () => {
    expect(normalizeSitePathPrefix("cyberpunk")).toBe("/cyberpunk/");
    expect(normalizeSitePathPrefix("/cyberpunk/")).toBe("/cyberpunk/");
  });

  it("uses the domain root when no prefix is configured", () => {
    expect(normalizeSitePathPrefix("")).toBe("/");
    expect(normalizeSitePathPrefix("/")).toBe("/");
  });

  it("rejects values that are not site path prefixes", () => {
    expect(() => normalizeSitePathPrefix("//host/path")).toThrow(
      "Invalid site path prefix"
    );
    expect(() => normalizeSitePathPrefix("/garden?preview")).toThrow(
      "Invalid site path prefix"
    );
  });
});

describe("prefixRootRelativeUrl", () => {
  it("adds the configured prefix to root-relative URLs", () => {
    expect(prefixRootRelativeUrl("/styles/style.css", "/cyberpunk/")).toBe(
      "/cyberpunk/styles/style.css"
    );
  });

  it("preserves already-prefixed and external URLs", () => {
    expect(prefixRootRelativeUrl("/cyberpunk/notes/home/", "/cyberpunk/")).toBe(
      "/cyberpunk/notes/home/"
    );
    expect(prefixRootRelativeUrl("https://example.com/a.css", "/cyberpunk/")).toBe(
      "https://example.com/a.css"
    );
    expect(prefixRootRelativeUrl("//cdn.example.com/a.css", "/cyberpunk/")).toBe(
      "//cdn.example.com/a.css"
    );
  });

  it("retains query strings and fragments", () => {
    expect(
      prefixRootRelativeUrl("/searchIndex.json?q=1#result", "/cyberpunk/")
    ).toBe("/cyberpunk/searchIndex.json?q=1#result");
  });
});

describe("prefixHtmlRootUrls", () => {
  it("prefixes local HTML asset and navigation URLs without changing external URLs", () => {
    const html =
      '<link href="/styles/style.css"><img srcset="/img/a.webp 1x, /img/b.webp 2x"><a href="/cyberpunk/notes/home/">Home</a><script src="https://cdn.example.com/app.js"></script>';

    expect(prefixHtmlRootUrls(html, "/cyberpunk/")).toBe(
      '<link href="/cyberpunk/styles/style.css"><img srcset="/cyberpunk/img/a.webp 1x, /cyberpunk/img/b.webp 2x"><a href="/cyberpunk/notes/home/">Home</a><script src="https://cdn.example.com/app.js"></script>'
    );
  });

  it("does not modify markup for sites hosted at the domain root", () => {
    const html = '<link href="/styles/style.css">';
    expect(prefixHtmlRootUrls(html, "/")).toBe(html);
  });
});

describe("prefixManifestIcons", () => {
  it("prefixes locally generated favicon manifest entries", () => {
    expect(
      prefixManifestIcons(
        { icons: [{ src: "/icon-192.png" }, { src: "/icon-512.png" }] },
        "/cyberpunk/"
      )
    ).toEqual({
      icons: [
        { src: "/cyberpunk/icon-192.png" },
        { src: "/cyberpunk/icon-512.png" },
      ],
    });
  });
});
