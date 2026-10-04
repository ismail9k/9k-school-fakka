import { describe, expect, it } from "vitest";
import { formatDate, formatNumber } from "./format";

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

describe("formatDate", () => {
  it("writes a long English date", () => {
    expect(formatDate("2026-10-04", "en")).toBe("October 4, 2026");
  });

  it("writes an Arabic date with Arabic-Indic digits", () => {
    expect(formatDate("2026-10-04", "ar")).toBe("٤ أكتوبر ٢٠٢٦");
  });
});
