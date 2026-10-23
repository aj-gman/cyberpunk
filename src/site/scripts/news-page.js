(async function () {
const listRoot = document.querySelector("[data-news-list]");
if (!listRoot) return;

const siteBaseUrl = new URL("../", document.currentScript.src);
const typeButtons = document.querySelectorAll("[data-news-type-filter]");
const campaignButtons = document.querySelectorAll("[data-news-campaign-filter]");

const state = { type: "corporate", campaign: "all" };
let items = null;

function showMessage(message, role = "status") {
const notice = document.createElement("p");
notice.setAttribute("role", role);
notice.textContent = message;
listRoot.replaceChildren(notice);
}

function matchesType(item) {
if (state.type === "corporate") return item.isCorporateNews;
return !item.isCorporateNews;
}

function matchesCampaign(item) {
return state.campaign === "all" || (Array.isArray(item.tags) && item.tags.includes(state.campaign));
}

function syncButtons() {
typeButtons.forEach((button) => {
button.setAttribute("aria-pressed", String(button.dataset.newsTypeFilter === state.type));
});
campaignButtons.forEach((button) => {
button.setAttribute("aria-pressed", String(button.dataset.newsCampaignFilter === state.campaign));
});
}

function render() {
if (!items) return;
syncButtons();

const filtered = items.filter((item) => matchesType(item) && matchesCampaign(item));
if (filtered.length === 0) {
showMessage("No news articles found.");
return;
}

const list = document.createElement("ul");
filtered.forEach((item) => {
const entry = document.createElement("li");
if (item.articleDate || item.createdAt) {
const date = document.createElement("span");
date.textContent = `${item.articleDate || item.createdAt} \u2014 `;
entry.append(date);
}

const link = document.createElement("a");
link.className = "internal-link";
link.href = new URL(item.url.replace(/^\/+/, ""), siteBaseUrl).href;
link.textContent = item.title;
entry.append(link);
list.append(entry);
});

listRoot.replaceChildren(list);
}

typeButtons.forEach((button) => {
button.addEventListener("click", () => {
state.type = button.dataset.newsTypeFilter;
render();
});
});

campaignButtons.forEach((button) => {
button.addEventListener("click", () => {
state.campaign = button.dataset.newsCampaignFilter;
render();
});
});

showMessage("Loading news...");

try {
const newsUrl = new URL(listRoot.dataset.newsSource || "news.json", siteBaseUrl);
const response = await fetch(newsUrl);
if (!response.ok) {
throw new Error(`News request failed with status ${response.status}.`);
}

const data = await response.json();
if (!Array.isArray(data)) {
throw new TypeError("The news data response must be an array.");
}

items = data;
render();
} catch (error) {
console.error("Unable to load news articles.", error);
showMessage("News could not be loaded. Please try again later.", "alert");
}
})();