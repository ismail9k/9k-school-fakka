import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import type { LegalDetails } from "@/lib/legal";
import { LegalPage } from "./LegalPage";
import { PrivacyContent } from "./PrivacyContent";
import { TermsContent } from "./TermsContent";

const empty: LegalDetails = { operatorName: null, contactEmail: null, governingLaw: null };
const filled: LegalDetails = {
  operatorName: { en: "Fakka Ltd", ar: "شركة فكّة" },
  contactEmail: "privacy@example.com",
  governingLaw: { en: "the laws of Egypt", ar: "قوانين مصر" },
};

function withIntl(node: React.ReactNode, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("PrivacyContent", () => {
  it("renders the title, date and every section in English", () => {
    withIntl(<PrivacyContent details={empty} />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText("Last updated: October 4, 2026")).toBeInTheDocument();
    for (const section of Object.values(en.Privacy.sections)) {
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
    }
    expect(screen.getByText("Your email")).toBeInTheDocument();
    expect(screen.getByText("Resend: sends our emails.")).toBeInTheDocument();
  });

  it("shows the draft notice and marked placeholders while details are missing", () => {
    const { container } = withIntl(<PrivacyContent details={empty} />);
    expect(screen.getByRole("note")).toHaveTextContent(en.Legal.draftNotice);
    expect(container.querySelectorAll("mark[data-placeholder]").length).toBeGreaterThan(0);
  });

  it("keeps the notice while a detail it shows is still missing", () => {
    withIntl(<PrivacyContent details={{ ...filled, contactEmail: null }} />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("drops the notice when only governing law, which it never shows, is missing", () => {
    withIntl(<PrivacyContent details={{ ...filled, governingLaw: null }} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("drops the notice and placeholders once details are filled", () => {
    const { container } = withIntl(<PrivacyContent details={filled} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(container.querySelectorAll("mark[data-placeholder]")).toHaveLength(0);
    expect(screen.getByText("Fakka Ltd")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "privacy@example.com" })[0]).toHaveAttribute(
      "href",
      "mailto:privacy@example.com",
    );
  });

  it("renders in Arabic and switches language to the same page", () => {
    withIntl(<PrivacyContent details={empty} />, "ar");
    expect(screen.getByRole("heading", { level: 1, name: "الخصوصية" })).toBeInTheDocument();
    expect(screen.getByText("آخر تحديث: ٤ أكتوبر ٢٠٢٦")).toBeInTheDocument();
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: ar.LocaleSwitch.label })).toHaveAttribute("href", "/en/privacy/");
  });
});

describe("TermsContent", () => {
  it("renders every section and links to the privacy page", () => {
    withIntl(<TermsContent details={empty} />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms" })).toBeInTheDocument();
    for (const section of Object.values(en.Terms.sections)) {
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Read our privacy policy" })).toHaveAttribute("href", "/en/privacy/");
    expect(screen.getByText("[Governing law — to be confirmed]")).toBeInTheDocument();
  });

  it("keeps the notice while governing law is missing", () => {
    withIntl(<TermsContent details={{ ...filled, governingLaw: null }} />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("drops the notice once every detail is filled", () => {
    withIntl(<TermsContent details={filled} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("switches language to the Arabic terms page", () => {
    withIntl(<TermsContent details={empty} />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: en.LocaleSwitch.label })).toHaveAttribute("href", "/ar/terms/");
  });
});

describe("LegalPage", () => {
  it("only accepts extras for the page's own sections (checked by tsc)", () => {
    const misspelled = () => (
      // @ts-expect-error -- "contacts" is not one of the page's sections, so its box would silently vanish.
      <LegalPage namespace="Terms" path="terms/" sections={["contact"] as const} details={empty} detailKinds={[]} extras={{ contacts: null }} />
    );
    expect(typeof misspelled).toBe("function");
  });
});
