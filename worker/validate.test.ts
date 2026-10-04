// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSignupRequest } from "./validate";

const valid = {
  name: "Mona",
  email: "mona@example.com",
  locale: "ar",
  ref: "k7qm2x9a",
  turnstileToken: "tok",
};

describe("parseSignupRequest", () => {
  it("accepts a valid body", () => {
    expect(parseSignupRequest(valid)).toEqual(valid);
  });

  it("trims name and email and strips control characters from the name", () => {
    expect(parseSignupRequest({ ...valid, name: "  Mo\u0000na\n ", email: " mona@example.com " })).toMatchObject({
      name: "Mona",
      email: "mona@example.com",
    });
  });

  it("strips invisible format characters such as bidi overrides from the name", () => {
    expect(parseSignupRequest({ ...valid, name: "Mo\u202Ena\u200B" })?.name).toBe("Mona");
  });

  it("keeps Arabic names", () => {
    expect(parseSignupRequest({ ...valid, name: "منى" })?.name).toBe("منى");
  });

  it.each([
    ["null", null],
    ["an array", [valid]],
    ["a string", "hi"],
    ["missing name", { ...valid, name: undefined }],
    ["blank name", { ...valid, name: "   " }],
    ["long name", { ...valid, name: "a".repeat(81) }],
    ["numeric name", { ...valid, name: 42 }],
    ["missing email", { ...valid, email: undefined }],
    ["email without @", { ...valid, email: "mona.example.com" }],
    ["email without dot in domain", { ...valid, email: "mona@example" }],
    ["email with spaces", { ...valid, email: "mo na@example.com" }],
    ["email in angle brackets", { ...valid, email: "<mona@x.com>" }],
    ["email with a comma", { ...valid, email: "mona,@x.com" }],
    ["long email", { ...valid, email: `${"a".repeat(250)}@x.co` }],
    ["unknown locale", { ...valid, locale: "fr" }],
    ["missing token", { ...valid, turnstileToken: undefined }],
    ["empty token", { ...valid, turnstileToken: "" }],
    ["long token", { ...valid, turnstileToken: "t".repeat(2049) }],
  ])("rejects %s", (_label, body) => {
    expect(parseSignupRequest(body)).toBeNull();
  });

  it("lowercases and trims the ref before matching", () => {
    expect(parseSignupRequest({ ...valid, ref: " K7QM2X9A " })?.ref).toBe("k7qm2x9a");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["wrong length", "abc"],
    ["ambiguous characters", "k7qm2x9l"],
    ["a number", 12345678],
  ])("treats a %s ref as no ref", (_label, ref) => {
    expect(parseSignupRequest({ ...valid, ref })?.ref).toBeNull();
  });
});
