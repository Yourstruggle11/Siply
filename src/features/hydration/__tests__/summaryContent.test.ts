import { describe, expect, it } from "vitest";
import { buildDailySummaryBody } from "../notifications/summaryContent";

describe("buildDailySummaryBody", () => {
  it("does not freeze a scheduled-time progress snapshot into the message", () => {
    const body = buildDailySummaryBody();

    expect(body).toContain("review today's progress");
    expect(body).not.toMatch(/\d+\s*ml/i);
    expect(body).not.toContain("%");
  });
});
