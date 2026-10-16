import { describe, expect, it } from "vitest";
import newsData from "./newsData.js";

const { buildNewsItems, cleanPreview, getPreviewParagraph, parseNewsNote } = newsData;

function note(inputPath, tags = []) {
	return {
		inputPath: `src/site/notes/${inputPath}.md`,
		url: `/${inputPath.toLowerCase().replaceAll(" ", "-")}/`,
		data: { tags },
	};
}

describe("newsData", () => {
	it("includes inline and frontmatter campaign tags and skips Site Chronicle", () => {
		const items = buildNewsItems(
			[
				note("Eurotour/News/Article", ["#news", "#eurotour"]),
				note("Site Chronicle", ["#news"]),
			],
			{
				readFile: (filePath) =>
					filePath.includes("Site Chronicle")
						? "#news"
						: '---\ntags: ["#news", "#eurotour"]\n---\n#news **April 2021**\n\nStory #eurotour.',
				statFile: () => ({ birthtime: new Date("2020-01-02T00:00:00Z") }),
			},
		);

		expect(items).toHaveLength(1);
		expect(items[0].tags).toEqual(expect.arrayContaining(["news", "eurotour"]));
		expect(items[0].articleDate).toBe("April 2021");
		expect(items[0].createdAt).toBe("2020-01-02");
	});

	it("uses the paragraph after metadata and detects a paragraph that is an image", () => {
		expect(
			getPreviewParagraph(
				"#news #4cw **July 2021**, [[Deep Six]]\n\n![report.png](/img/report.png)",
			),
		).toEqual({ image: "/img/report.png", text: "" });
	});

	it("cleans links and tags and keeps the nearest sentence end to 50 words", () => {
		const words = Array.from({ length: 55 }, (_, index) => `word${index + 1}`);
		words[45] += ".";
		words[51] += ".";
		const preview = cleanPreview(`#news [[Place|Night City]] ${words.join(" ")}`);

		expect(preview.split(" ")).toHaveLength(48);
		expect(preview).toContain("Night City");
		expect(preview.endsWith("word46.")).toBe(true);
	});

	it("sorts dated entries newest first and leaves undated entries last", () => {
		const items = buildNewsItems(
			[note("Older"), note("Undated"), note("Newer")],
			{
				readFile: (filePath) => {
					if (filePath.includes("Undated")) return "#news\n\nNo date.";
					return `#news **${filePath.includes("Newer") ? "July" : "March"} 2021**\n\nStory.`;
				},
				statFile: () => ({ birthtime: new Date("2020-01-02T00:00:00Z") }),
			},
		);

		expect(items.map((item) => item.title)).toEqual(["Newer", "Older", "Undated"]);
	});

	it("ignores a note that has no news tag", () => {
		expect(
			parseNewsNote(note("Not News"), "#eurotour\n\nStory.", new Date()),
		).toBeNull();
	});
});