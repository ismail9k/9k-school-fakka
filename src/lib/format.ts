import type { Locale } from "@/i18n/routing";

// Plain "ar" now defaults to Western digits in ICU; "ar-EG" gives the Arabic-Indic digits Egyptians expect.
export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", options).format(value);
}

// Takes a calendar date (YYYY-MM-DD) and formats it in UTC so it never shifts a day.
export function formatDate(isoDate: string, locale: Locale): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
