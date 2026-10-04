import type { Locale } from "@/i18n/routing";

type PerLocale = Record<Locale, string>;

export type LegalDetails = {
  operatorName: PerLocale | null;
  contactEmail: string | null;
  governingLaw: PerLocale | null;
};

// Placeholders until the real details exist. Replace a null with the real
// value and the Privacy and Terms pages drop its placeholder mark; once none
// is null, the draft notice disappears too.
export const LEGAL_DETAILS: LegalDetails = {
  operatorName: null,
  contactEmail: null,
  governingLaw: null,
};

// Bump when the Privacy or Terms copy changes (YYYY-MM-DD).
export const LEGAL_LAST_UPDATED = "2026-10-04";

export function hasMissingDetails(details: LegalDetails): boolean {
  return details.operatorName === null || details.contactEmail === null || details.governingLaw === null;
}
