import { useLocale, useTranslations } from "next-intl";
import { LocaleSwitch } from "./LocaleSwitch";
import { Wordmark } from "./Wordmark";

export function Footer() {
  const t = useTranslations("Footer");
  const locale = useLocale();
  // No grouping, so English shows "2026" (not "2,026") and Arabic gets Arabic digits.
  const year = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", {
    useGrouping: false,
  }).format(new Date().getFullYear());

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-8 text-sm text-ink-soft md:flex-row md:items-center md:justify-between md:px-10">
        <Wordmark className="text-xl" />
        <p>{t("privacy")}</p>
        <div className="flex items-center gap-4">
          <LocaleSwitch />
          <span>{t("rights", { year })}</span>
        </div>
      </div>
    </footer>
  );
}
