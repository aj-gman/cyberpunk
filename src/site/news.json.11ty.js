const { buildNewsItems } = require("../helpers/newsData");

module.exports = class NewsData {
	data() {
		return {
			permalink: "/news.json",
			eleventyExcludeFromCollections: true,
		};
	}

	render(data) {
		const notes = data.collections && data.collections.note;
		return JSON.stringify(buildNewsItems(notes || []));
	}
};
