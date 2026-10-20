(async function () {
	const listRoot = document.querySelector("[data-news-list]");
	if (!listRoot) return;

	const siteBaseUrl = new URL("../", document.currentScript.src);

	function showMessage(message, role = "status") {
		const notice = document.createElement("p");
		notice.setAttribute("role", role);
		notice.textContent = message;
		listRoot.replaceChildren(notice);
	}

	showMessage("Loading news...");

	try {
		const newsUrl = new URL(listRoot.dataset.newsSource || "news.json", siteBaseUrl);
		const response = await fetch(newsUrl);
		if (!response.ok) {
			throw new Error(`News request failed with status ${response.status}.`);
		}

		const items = await response.json();
		if (!Array.isArray(items)) {
			throw new TypeError("The news data response must be an array.");
		}

		const filter = listRoot.dataset.newsFilter || "all";
		if (!["all", "corporate", "independent"].includes(filter)) {
			throw new Error(`Unsupported news filter: ${filter}.`);
		}

		const filtered = items.filter((item) => {
			if (filter === "corporate") return item.isCorporateNews;
			if (filter === "independent") return !item.isCorporateNews;
			return true;
		});

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
	} catch (error) {
		console.error("Unable to load news articles.", error);
		showMessage("News could not be loaded. Please try again later.", "alert");
	}
})();
