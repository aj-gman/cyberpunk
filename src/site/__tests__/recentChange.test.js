import { describe, expect, it } from "vitest";
import recentChange from "../_data/recentChange.js";

describe("recentChange", () => {
  it("keeps each day with the month heading it appeared under", () => {
    const entry = recentChange().find(({ day }) => day === "09.10");

    expect(entry?.month).toBe("October 2026");
  });
});