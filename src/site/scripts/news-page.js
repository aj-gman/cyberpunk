(function () {
	const dataElement = document.getElementById("news-view-data");
	if (!dataElement) return;

	let items;
	try {
		items = JSON.parse(dataElement.dataset.items || "[]");
	} catch {
		return;
	}

	const campaigns = ["#eurotour", "#4cw"];
	const randomRoot = document.querySelector("[data-news-random]");
	const listRoot = document.querySelector("[data-news-list]");
	let randomCampaign = "#4cw";
	let listCampaign = null;

	function createButton(label, active, onClick, accessibleName = label) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.classList.toggle("mod-cta", active);
		button.setAttribute("aria-pressed", String(active));
		button.setAttribute("aria-label", accessibleName);
		button.addEventListener("click", onClick);
		return button;
	}

	function createControls() {
		const controls = document.createElement("div");
		controls.className = "news-view-controls";
		return controls;
	}

	function createLink(item) {
		const link = document.createElement("a");
		link.href = item.url;
		link.textContent = item.title;
		return link;
	}

	function renderRandom() {
		if (!randomRoot) return;
		randomRoot.replaceChildren();
		const controls = createControls();
		const result = document.createElement("div");
		result.className = "news-random-result";
		campaigns.forEach((campaign) => {
			controls.append(
				createButton(campaign, randomCampaign === campaign, () => {
					randomCampaign = campaign;
					renderRandom();
				}),
			);
		});
		controls.append(
			createButton("🎲", false, renderRandom, "Pick another random article"),
		);

		const pool = items.filter((item) =>
			item.tags.includes(randomCampaign.slice(1)),
		);
		if (pool.length === 0) {
			result.textContent = "No pages found.";
		} else {
			const item = pool[Math.floor(Math.random() * pool.length)];
			const heading = document.createElement("p");
			const date = item.articleDate || item.createdAt;
			if (date) {
				const strong = document.createElement("strong");
				strong.textContent = `${date} — `;
				heading.append(strong);
			}
			heading.append(createLink(item));
			result.append(heading);

			if (item.previewImage) {
				const image = document.createElement("img");
				image.src = item.previewImage;
				image.alt = item.title;
				image.loading = "lazy";
				result.append(image);
			} else if (item.previewText) {
				const excerpt = document.createElement("p");
				excerpt.textContent = item.previewText;
				result.append(excerpt);
			}
		}

		randomRoot.append(controls, result);
	}

	function renderList() {
		if (!listRoot) return;
		listRoot.replaceChildren();
		const controls = createControls();
		campaigns.forEach((campaign) => {
			controls.append(
				createButton(campaign, listCampaign === null || listCampaign === campaign, () => {
					listCampaign = listCampaign === campaign ? null : campaign;
					renderList();
				}),
			);
		});

		const filtered = items.filter(
			(item) => listCampaign === null || item.tags.includes(listCampaign.slice(1)),
		);
		const list = document.createElement("ul");
		filtered.forEach((item) => {
			const entry = document.createElement("li");
			if (item.articleDate) {
				const date = document.createElement("span");
				date.textContent = `${item.articleDate} — `;
				entry.append(date);
			}
			entry.append(createLink(item));
			list.append(entry);
		});

		listRoot.append(controls);
		if (filtered.length === 0) {
			const empty = document.createElement("p");
			empty.textContent = "No pages found.";
			listRoot.append(empty);
		} else {
			listRoot.append(list);
		}
	}

	renderRandom();
	renderList();
})();