import { useTranslations } from "next-intl";

export function Hero() {
  const t = useTranslations("Hero");

  return (
    <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-5 pt-12 pb-16 md:grid-cols-[1.3fr_1fr] md:px-10 md:pt-20 md:pb-24">
      <div>
        <h1 className="font-heading text-4xl leading-[1.1] text-balance rtl:leading-snug md:text-6xl">
          {t.rich("title", {
            highlight: (chunks) => <span className="text-green">{chunks}</span>,
          })}
        </h1>
        <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-ink-soft">{t("body")}</p>
        <a
          href="#join"
          className="mt-8 inline-block rounded-full bg-green px-6 py-3.5 font-heading text-paper transition-colors hover:bg-green-deep"
        >
          {t("cta")}
        </a>
        <p className="mt-3 text-sm text-ink-soft">{t("reassure")}</p>
      </div>
      <Coins />
    </section>
  );
}

function Coins() {
  return (
    <div aria-hidden="true" className="relative hidden h-64 md:block">
      <span className="coin absolute start-6 top-6 size-36" />
      <span className="coin absolute start-40 top-32 size-24" />
      <span className="coin absolute start-32 top-0 size-16 opacity-85" />
    </div>
  );
}
