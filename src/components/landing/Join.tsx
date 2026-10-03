import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";
import { WaitlistForm } from "./WaitlistForm";

export function Join() {
  const t = useTranslations("Waitlist");

  return (
    <section id="join" className="scroll-mt-6 bg-green text-paper">
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading onGreen kicker={t("kicker")} title={t("title")} />
        <p className="mt-3 text-paper/80">{t("body")}</p>
        <div className="mt-8">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
