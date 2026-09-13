import { describe, expect, it } from "vitest";
import { getMillisecondsUntilNextLocalDay } from "../useDayRollover";

describe("getMillisecondsUntilNextLocalDay", () => {
  it("targets just after the next local midnight", () => {
    const now = new Date(2026, 8, 14, 23, 59, 59, 0);

    expect(getMillisecondsUntilNextLocalDay(now)).toBe(1_050);
  });

  it("always advances to the following day when called at midnight", () => {
    const now = new Date(2026, 8, 14, 0, 0, 0, 0);

    expect(getMillisecondsUntilNextLocalDay(now)).toBe(24 * 60 * 60 * 1000 + 50);
  });
});
