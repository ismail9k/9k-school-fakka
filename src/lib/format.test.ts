import { describe, expect, it } from "vitest";
import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("uses Arabic-Indic digits on the Arabic page", () => {
    expect(formatNumber(1234, "ar")).toBe("١٬٢٣٤");
  });

  it("uses Western digits on the English page", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
  });

  it("passes options through", () => {
    expect(formatNumber(2026, "ar", { useGrouping: false })).toBe("٢٠٢٦");
    expect(formatNumber(2026, "en", { useGrouping: false })).toBe("2026");
  });
});
