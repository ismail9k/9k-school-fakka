import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { type DetailKind, hasMissingDetails, LEGAL_LAST_UPDATED, type LegalDetails } from "@/lib/legal";

type Section = { title: string; paragraphs?: string[]; items?: string[] };

export function LegalPage<K extends string>({
  namespace,
  path,
  sections,
  details,
  detailKinds,
  extras = {},
}: {
  namespace: "Privacy" | "Terms";
  path: string;
  sections: readonly K[];
  details: LegalDetails;
  /** The details this page shows; only these decide the draft notice. */
  detailKinds: readonly DetailKind[];
  // NoInfer: keys come from `sections` only, so a misspelled extras key is a type error.
  extras?: Partial<Record<NoInfer<K>, ReactNode>>;
}) {
  const t = useTranslations(namespace);
  const tl = useTranslations("Legal");
  const locale = useLocale() as Locale;

  return (
    <>
      <Header path={path} />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-3xl px-5 py-12 md:px-10 md:py-16">
          <h1 className="font-heading text-4xl leading-tight md:text-5xl">{t("title")}</h1>
          <p className="mt-3 text-sm text-ink-soft">
            {tl("updated", { date: formatDate(LEGAL_LAST_UPDATED, locale) })}
          </p>
          {hasMissingDetails(details, detailKinds) && (
            <p role="note" className="mt-6 rounded-lg border border-gold bg-gold/15 p-4 text-sm">
              {tl("draftNotice")}
            </p>
          )}
          <p className="mt-8 text-lg leading-relaxed">{t("intro")}</p>
          {sections.map((key) => {
            const section = t.raw(`sections.${key}`) as Section;
            return (
              <section key={key} aria-labelledby={`${key}-title`} className="mt-10">
                <h2 id={`${key}-title`} className="font-heading text-2xl">
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph, i) => (
                  <p key={i} className="mt-3 leading-relaxed text-ink-soft">
                    {paragraph}
                  </p>
                ))}
                {section.items && (
                  <ul className="mt-3 list-disc space-y-2 ps-5 leading-relaxed text-ink-soft">
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
                {extras[key]}
              </section>
            );
          })}
        </article>
      </main>
      <Footer path={path} />
    </>
  );
}
