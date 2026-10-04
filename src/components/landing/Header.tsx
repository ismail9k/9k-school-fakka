import { useLocale, useTranslations } from "next-intl";
import { LocaleSwitch } from "./LocaleSwitch";
import { Wordmark } from "./Wordmark";

export function Header({ path = "" }: { path?: string }) {
  const t = useTranslations("Header");
  const locale = useLocale();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 md:px-10">
        <a href={`/${locale}/`} aria-label={t("home")}>
          <Wordmark />
        </a>
        <LocaleSwitch path={path} />
      </div>
    </header>
  );
}
