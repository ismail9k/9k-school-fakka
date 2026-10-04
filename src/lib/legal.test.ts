import { describe, expect, it } from "vitest";
import { hasMissingDetails, LEGAL_DETAILS, type LegalDetails } from "./legal";

const filled: LegalDetails = {
  operatorName: { en: "Fakka Ltd", ar: "شركة فكّة" },
  contactEmail: "privacy@example.com",
  governingLaw: { en: "the laws of Egypt", ar: "قوانين مصر" },
};

describe("hasMissingDetails", () => {
  it("is true while every detail is a placeholder", () => {
    expect(hasMissingDetails(LEGAL_DETAILS)).toBe(true);
  });

  it("is false once every detail is filled", () => {
    expect(hasMissingDetails(filled)).toBe(false);
  });

  it("is true when only one detail is still missing", () => {
    expect(hasMissingDetails({ ...filled, governingLaw: null })).toBe(true);
  });

  it("only checks the details a page shows", () => {
    const lawMissing = { ...filled, governingLaw: null };
    expect(hasMissingDetails(lawMissing, ["operator", "contact"])).toBe(false);
    expect(hasMissingDetails(lawMissing, ["law"])).toBe(true);
    expect(hasMissingDetails({ ...filled, contactEmail: null }, ["operator", "contact"])).toBe(true);
  });
});
