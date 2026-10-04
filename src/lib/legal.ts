import type { Locale } from "@/i18n/routing";

type PerLocale = Record<Locale, string>;

export type LegalDetails = {
  operatorName: PerLocale | null;
  contactEmail: string | null;
  governingLaw: PerLocale | null;
};

// Placeholders until the real details exist. Replace a null with the real
// value and the Privacy and Terms pages drop its placeholder mark; once none
// of the details a page shows is null, that page's draft notice disappears.
export const LEGAL_DETAILS: LegalDetails = {
  operatorName: null,
  contactEmail: null,
  governingLaw: null,
};

// Bump when the Privacy or Terms copy changes (YYYY-MM-DD).
export const LEGAL_LAST_UPDATED = "2026-10-04";

export type DetailKind = "operator" | "contact" | "law";

const ALL_DETAILS: readonly DetailKind[] = ["operator", "contact", "law"];

// Pass the kinds a page shows, so a page isn't marked as a draft over a
// detail it never displays.
export function hasMissingDetails(details: LegalDetails, kinds: readonly DetailKind[] = ALL_DETAILS): boolean {
  return kinds.some((kind) => {
    if (kind === "operator") return details.operatorName === null;
    if (kind === "law") return details.governingLaw === null;
    return details.contactEmail === null;
  });
}
