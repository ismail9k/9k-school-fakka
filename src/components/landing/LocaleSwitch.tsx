import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";

export function LocaleSwitch({ path = "" }: { path?: string }) {
  const t = useTranslations("LocaleSwitch");
  const locale = useLocale();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <a
      href={`/${other}/${path}`}
      hrefLang={other}
      lang={other}
      className="rounded-full border border-ink px-4 py-1.5 text-sm transition-colors hover:bg-ink hover:text-paper"
    >
      {t("label")}
    </a>
  );
}
