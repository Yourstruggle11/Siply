import { describe, expect, it } from "vitest";
import { parseLiquidInputToMl } from "../units";

describe("parseLiquidInputToMl", () => {
  it("keeps milliliter input in milliliters", () => {
    expect(parseLiquidInputToMl("250", "ml")).toBe(250);
  });

  it("converts fluid ounces to milliliters", () => {
    expect(parseLiquidInputToMl("8", "fl oz")).toBe(237);
  });

  it("converts decimal cup input to milliliters", () => {
    expect(parseLiquidInputToMl("0.5", "cups")).toBe(120);
  });

  it("rejects empty, non-numeric, zero, and negative input", () => {
    expect(parseLiquidInputToMl("", "ml")).toBeNull();
    expect(parseLiquidInputToMl("water", "ml")).toBeNull();
    expect(parseLiquidInputToMl("0", "cups")).toBeNull();
    expect(parseLiquidInputToMl("-2", "fl oz")).toBeNull();
  });
});
