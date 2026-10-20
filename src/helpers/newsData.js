const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const matterOptions = require("./matterOptions");

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];
const MONTH_DATE = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`, "i");
const INLINE_TAG = /(?:^|\s)#([\p{L}\d][\p{L}\d_/-]*)/gu;
const CORPORATE_NEWS_ORGANIZATIONS = new Set(["n54", "network news 54"]);
const WIKILINK = /\[\[([^\]|]+)(?:\\?\|([^\]]+))?\]\]/g;

function normalizeTag(tag) {
	return String(tag).trim().replace(/^#/, "").toLowerCase();
}

function collectTags(note, frontmatter, body) {
	const tags = new Set();
	const frontmatterTags = [
		...(Array.isArray(note.data?.tags) ? note.data.tags : [note.data?.tags]),
		...(Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags]),
		...(Array.isArray(frontmatter["dg-note-properties"]?.tags)
			? frontmatter["dg-note-properties"].tags
			: [frontmatter["dg-note-properties"]?.tags]),
	];

	for (const tag of frontmatterTags) {
		if (tag) tags.add(normalizeTag(tag));
	}

	const searchableBody = body
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`]*`/g, "");
	for (const match of searchableBody.matchAll(INLINE_TAG)) {
		tags.add(normalizeTag(match[1]));
	}

	return tags;
}

function isCorporateNewsMetadata(metadata) {
	const firstLine = String(metadata).split(/\r?\n/).find((line) => line.trim()) || "";
	if (!/(?:^|\s)#news(?=$|[\s,;])/i.test(firstLine)) return false;

	for (const match of firstLine.matchAll(WIKILINK)) {
		const linkedName = match[1].split("/").pop().replace(/\\/g, "").trim();
		const alias = match[2]?.replace(/\\/g, "").trim();
		if (
			CORPORATE_NEWS_ORGANIZATIONS.has(linkedName.toLowerCase()) ||
			(alias && CORPORATE_NEWS_ORGANIZATIONS.has(alias.toLowerCase()))
		) {
			return true;
		}
	}

	return false;
}

function formatDate(value) {
	if (value === null || value === undefined || value === "") return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseArticleDate(body) {
	const match = body.match(MONTH_DATE);
	if (!match) return null;

	const monthIndex = MONTHS.findIndex(
		(month) => month.toLowerCase() === match[1].toLowerCase(),
	);
	return {
		label: `${MONTHS[monthIndex]} ${match[2]}`,
		timestamp: Date.UTC(Number(match[2]), monthIndex, 1),
	};
}

function getPreviewParagraph(body) {
	const paragraphs = body
		.trim()
		.split(/\r?\n\s*\r?\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
	const paragraph = paragraphs[1] || "";
	const image = paragraph.match(/^!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))[^)]*\)\s*$/);

	return {
		image: image ? image[1] || image[2] : null,
		text: image ? "" : paragraph,
	};
}

function cleanPreview(raw) {
	const text = raw
		.replace(/```[\s\S]*?```/g, "")
		.replace(/^#+\s.*$/gm, "")
		.replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(^|\s)#[\w/-]+/g, "$1")
		.replace(/[*_>`]/g, "")
		.replace(/\\\|/g, "|")
		.replace(/\s+/g, " ")
		.trim();
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length <= 50) return text;

	let closestSentenceEnd = -1;
	words.forEach((word, index) => {
		if (
			/[.!?]$/.test(word) &&
			(closestSentenceEnd < 0 ||
				Math.abs(index + 1 - 50) < Math.abs(closestSentenceEnd + 1 - 50))
		) {
			closestSentenceEnd = index;
		}
	});

	if (closestSentenceEnd >= 0) {
		return words.slice(0, closestSentenceEnd + 1).join(" ");
	}
	return `${words.slice(0, 50).join(" ")}\u2026`;
}

function parseNewsNote(note, source, createdAt = null) {
	const parsed = matter(source, matterOptions);
	const title = path.basename(note.inputPath || note.fileSlug || "", ".md");
	if (["Site Chronicle", "Independent News", "Corporate News"].includes(title)) return null;

	const tags = collectTags(note, parsed.data || {}, parsed.content);
	if (!tags.has("news")) return null;

	const articleDate = parseArticleDate(parsed.content);
	const preview = getPreviewParagraph(parsed.content);
	return {
		title,
		url: note.url,
		tags: [...tags],
		isCorporateNews: isCorporateNewsMetadata(parsed.content),
		articleDate: articleDate?.label || null,
		articleTimestamp: articleDate?.timestamp ?? null,
		createdAt: formatDate(createdAt),
		previewImage: preview.image,
		previewText: preview.image ? "" : cleanPreview(preview.text),
	};
}

function buildNewsItems(notes, { readFile = fs.readFileSync, statFile = fs.statSync } = {}) {
	return (notes || [])
		.map((note) => {
			if (!note.inputPath) return null;
			const sourcePath = path.resolve(note.inputPath);
			const source = readFile(sourcePath, "utf8");
			const stat = statFile(sourcePath);
			return parseNewsNote(note, source, stat.birthtime || stat.mtime);
		})
		.filter(Boolean)
		.sort((a, b) => {
			if (a.articleTimestamp === null && b.articleTimestamp !== null) return 1;
			if (a.articleTimestamp !== null && b.articleTimestamp === null) return -1;
			if (a.articleTimestamp !== b.articleTimestamp) {
				return (b.articleTimestamp || 0) - (a.articleTimestamp || 0);
			}
			return a.title.localeCompare(b.title);
		});
}

module.exports = {
	buildNewsItems,
	cleanPreview,
	getPreviewParagraph,
	isCorporateNewsMetadata,
	parseNewsNote,
};
