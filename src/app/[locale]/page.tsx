import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Home locale={locale} />;
}

function Home({ locale }: { locale: string }) {
  const t = useTranslations("Home");
  const otherLocale = routing.locales.find((l) => l !== locale);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-5xl font-bold tracking-tight">{t("title")}</h1>
      <p className="max-w-md text-lg opacity-80">{t("tagline")}</p>
      <a
        href={`/${otherLocale}/`}
        hrefLang={otherLocale}
        className="rounded-full border px-4 py-2 text-sm hover:bg-foreground hover:text-background"
      >
        {t("switchLocale")}
      </a>
    </main>
  );
}
