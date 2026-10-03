import { useLocale, useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const STEPS = ["join", "invite", "receive"] as const;

export function NextSteps() {
  const t = useTranslations("NextSteps");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", { useGrouping: false });

  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading kicker={t("kicker")} title={t("title")} />
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((key, index) => (
            <li key={key} className="flex gap-4 md:flex-col">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-green font-heading text-green"
              >
                {number.format(index + 1)}
              </span>
              <div>
                <h3 className="font-heading text-lg">{t(`steps.${key}.title`)}</h3>
                <p className="mt-1 leading-relaxed text-ink-soft">{t(`steps.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <a
          href="#join"
          className="mt-10 inline-block rounded-full bg-green px-6 py-3.5 font-heading text-paper transition-colors hover:bg-green-deep"
        >
          {t("cta")}
        </a>
      </div>
    </section>
  );
}
