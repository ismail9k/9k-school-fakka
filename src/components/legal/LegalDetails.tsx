import { useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";
import type { Locale } from "@/i18n/routing";
import type { DetailKind, LegalDetails } from "@/lib/legal";

export type { DetailKind };

function valueFor(kind: DetailKind, details: LegalDetails, locale: Locale): string | null {
  if (kind === "operator") return details.operatorName?.[locale] ?? null;
  if (kind === "law") return details.governingLaw?.[locale] ?? null;
  return details.contactEmail;
}

function Detail({ kind, value }: { kind: DetailKind; value: string | null }) {
  const t = useTranslations("Legal");
  if (value === null) {
    return (
      <mark data-placeholder className="rounded bg-gold/40 px-1 text-ink">
        {t(`placeholders.${kind}`)}
      </mark>
    );
  }
  if (kind === "contact") {
    return (
      <a href={`mailto:${value}`} dir="ltr" className="text-green underline underline-offset-4">
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

export function DetailsList({ kinds, details }: { kinds: DetailKind[]; details: LegalDetails }) {
  const t = useTranslations("Legal");
  const locale = useLocale() as Locale;

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg border border-line p-4 sm:grid-cols-[auto_1fr]">
      {kinds.map((kind) => (
        <Fragment key={kind}>
          <dt className="text-ink-soft">{t(`details.${kind}`)}</dt>
          <dd>
            <Detail kind={kind} value={valueFor(kind, details, locale)} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
