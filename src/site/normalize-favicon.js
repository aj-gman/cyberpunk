const fs = require("fs");
const path = require("path");

const MAX_DIM = 512;

// Windows can briefly lock files (EBUSY/EPERM/EACCES) when another process
// (preview server, antivirus, sync client) has them open. Retry those errors.
const RETRY_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 200;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withRetry(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return fn();
    } catch (err) {
      if (!RETRY_CODES.has(err.code) || attempt >= RETRY_ATTEMPTS) throw err;
      sleepSync(RETRY_DELAY_MS);
    }
  }
}

// Writes only when the content changed, and writes through a temp file so the
// target is never left half-written. Warns instead of throwing on persistent locks.
function writeOutput(outputPath, content) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let existing = null;
  try {
    existing = fs.readFileSync(outputPath, "utf8");
  } catch (_) {
    // Missing or locked; treat as changed and attempt the write.
  }
  if (existing === content) return;

  const tmpPath = `${outputPath}.${process.pid}.tmp`;
  try {
    withRetry(() => fs.writeFileSync(tmpPath, content));
    withRetry(() => fs.renameSync(tmpPath, outputPath));
  } catch (err) {
    console.warn(
      `[favicon] Could not write ${outputPath} (${err.code || err.message}). Keeping previous file.`
    );
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {
      // Temp file may not exist; nothing to clean up.
    }
  }
}

function normalizeFavicon(inputPath, outputPath) {
  const content = fs.readFileSync(inputPath, "utf8");

  const svgTagMatch = content.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    writeOutput(outputPath, content);
    return;
  }

  const svgTag = svgTagMatch[0];
  const widthMatch = svgTag.match(/\bwidth\s*=\s*"([^"]+)"/i);
  const heightMatch = svgTag.match(/\bheight\s*=\s*"([^"]+)"/i);
  const viewBoxMatch = svgTag.match(/\bviewBox\s*=\s*"([^"]+)"/i);

  const parseDim = (s) => {
    if (s === undefined || s === null) return NaN;
    const m = String(s).match(/^[\d.]+/);
    return m ? parseFloat(m[0]) : NaN;
  };

  let effectiveWidth = parseDim(widthMatch && widthMatch[1]);
  let effectiveHeight = parseDim(heightMatch && heightMatch[1]);

  if ((!isFinite(effectiveWidth) || !isFinite(effectiveHeight)) && viewBoxMatch) {
    const vb = viewBoxMatch[1].trim().split(/[\s,]+/).map(parseFloat);
    if (vb.length === 4) {
      if (!isFinite(effectiveWidth)) effectiveWidth = vb[2];
      if (!isFinite(effectiveHeight)) effectiveHeight = vb[3];
    }
  }

  const maxDim = Math.max(effectiveWidth || 0, effectiveHeight || 0);

  if (!isFinite(maxDim) || maxDim === 0 || maxDim <= MAX_DIM) {
    writeOutput(outputPath, content);
    return;
  }

  const scale = MAX_DIM / maxDim;
  const newWidth = Math.round(effectiveWidth * scale);
  const newHeight = Math.round(effectiveHeight * scale);

  let newSvgTag = svgTag;

  if (!viewBoxMatch) {
    newSvgTag = newSvgTag.replace(
      /<svg\b/i,
      `<svg viewBox="0 0 ${effectiveWidth} ${effectiveHeight}"`
    );
  }

  if (widthMatch) {
    newSvgTag = newSvgTag.replace(/\bwidth\s*=\s*"[^"]+"/i, `width="${newWidth}"`);
  } else {
    newSvgTag = newSvgTag.replace(/<svg\b/i, `<svg width="${newWidth}"`);
  }
  if (heightMatch) {
    newSvgTag = newSvgTag.replace(/\bheight\s*=\s*"[^"]+"/i, `height="${newHeight}"`);
  } else {
    newSvgTag = newSvgTag.replace(/<svg\b/i, `<svg height="${newHeight}"`);
  }

  writeOutput(outputPath, content.replace(svgTag, newSvgTag));
}

// eleventy-plugin-gen-favicons runs its shortcode once per rendered page. Pages
// render concurrently, so several calls copy the same dist/favicon.svg at once,
// and Windows rejects that with EBUSY. This wrapper runs the shortcode calls one
// at a time and retries a call that fails with a lock error.
async function retryAsync(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!RETRY_CODES.has(err.code) || attempt >= RETRY_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

function serializedFaviconsPlugin(eleventyConfig, options) {
  const faviconsPlugin = require("eleventy-plugin-gen-favicons");
  const wrappedConfig = {
    addAsyncShortcode(name, fn) {
      let queue = Promise.resolve();
      eleventyConfig.addAsyncShortcode(name, (...args) => {
        const run = queue.then(() => retryAsync(() => fn(...args)));
        queue = run.catch(() => {});
        return run;
      });
    },
  };
  faviconsPlugin(wrappedConfig, options);
}

module.exports = normalizeFavicon;
module.exports.serializedFaviconsPlugin = serializedFaviconsPlugin;
