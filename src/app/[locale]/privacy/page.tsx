import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { routing } from "@/i18n/routing";
import { LEGAL_DETAILS } from "@/lib/legal";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/privacy/`]),
      ),
    },
  };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PrivacyContent details={LEGAL_DETAILS} />;
}
