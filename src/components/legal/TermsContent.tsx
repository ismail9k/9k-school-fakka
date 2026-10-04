import { useLocale, useTranslations } from "next-intl";
import type { LegalDetails } from "@/lib/legal";
import { DetailsList } from "./LegalDetails";
import { LegalPage } from "./LegalPage";

const SECTIONS = ["what", "joining", "queue", "invites", "promises", "data", "changes", "law", "contact"] as const;

export function TermsContent({ details }: { details: LegalDetails }) {
  const t = useTranslations("Legal");
  const locale = useLocale();

  return (
    <LegalPage
      namespace="Terms"
      path="terms/"
      sections={SECTIONS}
      details={details}
      detailKinds={["operator", "contact", "law"]}
      extras={{
        what: <DetailsList kinds={["operator"]} details={details} />,
        data: (
          <p className="mt-3">
            <a href={`/${locale}/privacy/`} className="text-green underline underline-offset-4">
              {t("privacyLink")}
            </a>
          </p>
        ),
        law: <DetailsList kinds={["law"]} details={details} />,
        contact: <DetailsList kinds={["contact"]} details={details} />,
      }}
    />
  );
}
