import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

// Same keys everywhere, and the same number of paragraphs and bullets, so the
// two languages can't drift apart.
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shape((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value;
}

describe("messages", () => {
  it("have the same shape in English and Arabic", () => {
    expect(shape(ar)).toEqual(shape(en));
  });

  it("include the privacy and terms pages", () => {
    expect(Object.keys(en.Privacy.sections)).toEqual([
      "who", "keep", "why", "emails", "notKept", "helpers", "howLong", "choices", "changes",
    ]);
    expect(Object.keys(en.Terms.sections)).toEqual([
      "what", "joining", "queue", "invites", "promises", "data", "changes", "law", "contact",
    ]);
  });
});
