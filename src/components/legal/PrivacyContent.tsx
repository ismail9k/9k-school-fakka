import type { LegalDetails } from "@/lib/legal";
import { DetailsList } from "./LegalDetails";
import { LegalPage } from "./LegalPage";

const SECTIONS = ["who", "keep", "why", "emails", "notKept", "helpers", "howLong", "choices", "changes"] as const;

export function PrivacyContent({ details }: { details: LegalDetails }) {
  return (
    <LegalPage
      namespace="Privacy"
      path="privacy/"
      sections={SECTIONS}
      details={details}
      detailKinds={["operator", "contact"]}
      extras={{
        who: <DetailsList kinds={["operator", "contact"]} details={details} />,
        choices: <DetailsList kinds={["contact"]} details={details} />,
      }}
    />
  );
}
