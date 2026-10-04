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

// Key paths of every string leaf that is empty or whitespace-only.
function emptyStrings(value: unknown, path = ""): string[] {
  if (typeof value === "string") return value.trim() === "" ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => emptyStrings(item, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      emptyStrings(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe("messages", () => {
  it("have no empty or whitespace-only strings", () => {
    expect({ en: emptyStrings(en), ar: emptyStrings(ar) }).toEqual({ en: [], ar: [] });
  });

  it("empty-string check reports the key path", () => {
    expect(emptyStrings({ a: { b: ["x", " "] }, c: "" })).toEqual(["a.b[1]", "c"]);
  });

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
