import { describe, expect, it } from "vitest";
import { normalizeInsightOutput } from "../ai/output";

describe("AI insight output validation", () => {
  it("rejects leaked meta-reasoning instead of showing or caching it", () => {
    expect(normalizeInsightOutput(
      "The user wants a concise response. I need to write one insight.",
      55
    )).toBeNull();
  });

  it("accepts a concise user-facing insight", () => {
    expect(normalizeInsightOutput("Your morning logs are becoming more consistent.", 55))
      .toBe("Your morning logs are becoming more consistent.");
  });

  it("rejects the no-additional-insight sentinel and overlong output", () => {
    expect(normalizeInsightOutput("NO_ADDITIONAL_INSIGHT", 55)).toBeNull();
    expect(normalizeInsightOutput(Array.from({ length: 56 }, () => "word").join(" "), 55))
      .toBeNull();
  });
});
