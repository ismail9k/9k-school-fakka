import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const ITEMS = ["fast", "month", "egypt"] as const;

const ICONS: Record<(typeof ITEMS)[number], ReactNode> = {
  fast: (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  month: (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </svg>
  ),
  egypt: (
    <span lang="ar" className="font-wordmark text-sm">
      ج.م
    </span>
  ),
};

export function Features() {
  const t = useTranslations("Features");

  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading kicker={t("kicker")} title={t("title")} />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {ITEMS.map((key) => (
            <li key={key} className="rounded-2xl bg-green-tint p-6">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-green text-paper">
                {ICONS[key]}
              </span>
              <h3 className="mt-5 font-heading text-lg">{t(`items.${key}.title`)}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
