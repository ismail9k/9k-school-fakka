import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const QUESTIONS = ["what", "who", "when", "queue", "data", "emails"] as const;

export function Faq() {
  const t = useTranslations("Faq");

  return (
    <section>
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading kicker={t("kicker")} title={t("title")} />
        <div className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
          {QUESTIONS.map((key) => (
            <details key={key} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-lg [&::-webkit-details-marker]:hidden">
                {t(`items.${key}.q`)}
                <span
                  aria-hidden="true"
                  className="text-2xl leading-none text-green transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-soft">{t(`items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
