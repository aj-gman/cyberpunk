(function () {
  const script = document.currentScript;
  if (!script || script.dataset.stockTickerLoaded === "true") return;
  script.dataset.stockTickerLoaded = "true";

  const scriptUrl = new URL(script.src, document.baseURI);
  const stockUrl = new URL("../night-city/organizations/corporations/stock/", scriptUrl);
  const currentPath = window.location.pathname.replace(/\/+$/, "");
  const stockPath = stockUrl.pathname.replace(/\/+$/, "");
  if (currentPath === stockPath) return;

  const host = document.querySelector(".navbar, .empty-navbar");
  const standaloneContent = host ? null : document.querySelector(".content");
  const target = host || document.body;
  if (!target || target.querySelector(".stock-ticker")) return;

  const cacheKey = "stock-ticker-snapshot-v1";
  const cacheDuration = 5 * 60 * 1000;

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey));
      if (
        !cached ||
        !Number.isFinite(cached.cachedAt) ||
        Date.now() - cached.cachedAt < 0 ||
        Date.now() - cached.cachedAt >= cacheDuration ||
        typeof cached.timestamp !== "string" ||
        !cached.timestamp.trim() ||
        !Array.isArray(cached.items) ||
        cached.items.length === 0 ||
        !cached.items.every((item) =>
          item &&
          typeof item.ticker === "string" &&
          item.ticker.trim() &&
          typeof item.href === "string" &&
          /^https?:\/\//i.test(item.href) &&
          typeof item.amount === "string" &&
          ["positive", "negative", "neutral"].includes(item.direction)
        )
      ) {
        return null;
      }
      return cached;
    } catch {
      return null;
    }
  }

  function parseChange(value) {
    const match = value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/);
    const number = match ? Number(match[0]) : 0;
    const direction = number > 0 ? "positive" : number < 0 ? "negative" : "neutral";
    const amount = direction === "neutral"
      ? "0"
      : direction === "positive" && !match[0].startsWith("+")
        ? `+${match[0]}`
        : match[0];

    return { amount, direction };
  }

  function parseSnapshot(html, pageUrl) {
    const page = new DOMParser().parseFromString(html, "text/html");
    const table = page.querySelector("table");
    if (!table) return null;

    let timestamp = "";
    for (
      let container = table;
      container && container !== page.body && !timestamp;
      container = container.parentElement
    ) {
      for (let element = container.previousElementSibling; element; element = element.previousElementSibling) {
        const bold = element.matches("strong, b") ? element : element.querySelector("strong, b");
        if (!bold) continue;
        const match = bold.textContent.trim().match(/^Ticker snapshot\s*:?\s*\(?\s*(.+?)\s*\)?$/i);
        if (match) {
          timestamp = match[1].trim().toUpperCase();
          break;
        }
      }
    }
    if (!timestamp) return null;

    const rows = Array.from(table.querySelectorAll("tr"));
    const header = rows.find((row) => Array.from(row.cells).some((cell) => cell.tagName === "TH"));
    if (!header) return null;

    const headers = Array.from(header.cells).map((cell) => cell.textContent.trim().toLowerCase());
    const tickerIndex = headers.findIndex((value) => value === "ticker");
    const changeIndex = headers.findIndex((value) => value.includes("change"));
    if (tickerIndex < 0 || changeIndex < 0) return null;

    const items = [];
    for (const row of rows) {
      if (row === header) continue;
      const cells = Array.from(row.cells);
      if (!cells[tickerIndex] || !cells[changeIndex]) continue;

      const anchor = cells[tickerIndex].querySelector("a[href]");
      const ticker = anchor?.textContent.trim();
      if (!ticker) continue;

      const href = new URL(anchor.getAttribute("href"), pageUrl);
      if (href.protocol !== "http:" && href.protocol !== "https:") continue;
      const change = parseChange(cells[changeIndex].textContent);
      items.push({ ticker, href: href.href, ...change });
    }

    return items.length ? { timestamp, items, cachedAt: Date.now() } : null;
  }

  async function getSnapshot() {
    const cached = readCache();
    if (cached) return cached;

    const response = await fetch(stockUrl.href);
    if (!response.ok) throw new Error("Stock snapshot request failed.");

    const pageUrl = response.url || stockUrl.href;
    const snapshot = parseSnapshot(await response.text(), pageUrl);
    if (!snapshot) throw new Error("Stock snapshot could not be parsed.");

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(snapshot));
    } catch {
      // The ticker still works when session storage is unavailable.
    }
    return snapshot;
  }

  function addTickerItem(parent, item, linked) {
    const entry = document.createElement("span");
    entry.className = "stock-ticker__item";
    const content = linked ? document.createElement("a") : document.createElement("span");
    content.className = "stock-ticker__link";
    if (linked) content.href = item.href;

    const ticker = document.createElement("span");
    ticker.className = "stock-ticker__symbol";
    ticker.textContent = item.ticker;
    content.append(ticker);

    if (item.direction !== "neutral") {
      const arrow = document.createElement("span");
      arrow.className = `stock-ticker__arrow stock-ticker__change--${item.direction}`;
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = item.direction === "positive" ? "▲" : "▼";
      content.append(arrow);
    }

    const change = document.createElement("span");
    change.className = `stock-ticker__change stock-ticker__change--${item.direction}`;
    change.textContent = `${item.amount}%`;
    content.append(change);
    entry.append(content);
    parent.append(entry);
  }

  function render(snapshot) {
    const bar = document.createElement("div");
    bar.className = `stock-ticker${host ? "" : " stock-ticker--standalone"}`;
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", `Stock ticker, snapshot ${snapshot.timestamp}`);

    const label = document.createElement("span");
    label.className = "stock-ticker__snapshot";
    label.textContent = snapshot.timestamp;
    bar.append(label);

    const viewport = document.createElement("div");
    viewport.className = "stock-ticker__viewport";
    const track = document.createElement("div");
    track.className = "stock-ticker__track";
    const items = document.createElement("div");
    items.className = "stock-ticker__group";
    const duplicate = document.createElement("div");
    duplicate.className = "stock-ticker__group stock-ticker__group--duplicate";
    duplicate.setAttribute("aria-hidden", "true");

    snapshot.items.forEach((item) => addTickerItem(items, item, true));
    snapshot.items.forEach((item) => addTickerItem(duplicate, item, false));
    track.append(items, duplicate);
    viewport.append(track);
    bar.append(viewport);

    const actions = host?.querySelector(".navbar-actions");
    target.insertBefore(bar, standaloneContent || actions || target.firstChild);
  }

  function loadStyles() {
    if (document.querySelector("link[data-stock-ticker-styles]")) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = new URL("stock-ticker.css", scriptUrl).href;
      stylesheet.dataset.stockTickerStyles = "true";
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
      document.head.append(stylesheet);
    });
  }

  getSnapshot()
    .then((snapshot) => loadStyles().then(() => render(snapshot)))
    .catch(() => {});
})();
