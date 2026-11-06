import { describe, expect, it } from "vitest";
import recentChange from "../_data/recentChange.js";

const { parseChronicle } = recentChange;

describe("recentChange", () => {
  it("keeps each day with the month heading it appeared under", () => {
    const fixture = [
      "### October 2026",
      "",
      "#### 09.10",
      "",
      "- [[Some Note|A thing that happened]]",
      "",
      "### November 2026",
      "",
      "#### 02.11",
      "",
      "- [[Another Note]]",
      "",
    ].join("\n");

    const entries = parseChronicle(fixture);
    const entry = entries.find(({ day }) => day === "09.10");

    expect(entry?.month).toBe("October 2026");
    expect(entry?.items).toEqual(["A thing that happened"]);
  });
});
