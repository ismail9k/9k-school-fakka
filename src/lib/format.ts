import type { Locale } from "@/i18n/routing";

// Plain "ar" now defaults to Western digits in ICU; "ar-EG" gives the Arabic-Indic digits Egyptians expect.
export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", options).format(value);
}
