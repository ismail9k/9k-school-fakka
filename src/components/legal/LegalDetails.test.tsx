import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import type { LegalDetails } from "@/lib/legal";
import { DetailsList } from "./LegalDetails";

const empty: LegalDetails = { operatorName: null, contactEmail: null, governingLaw: null };
const filled: LegalDetails = {
  operatorName: { en: "Fakka Ltd", ar: "شركة فكّة" },
  contactEmail: "privacy@example.com",
  governingLaw: { en: "the laws of Egypt", ar: "قوانين مصر" },
};

function renderList(details: LegalDetails, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <DetailsList kinds={["operator", "contact", "law"]} details={details} />
    </NextIntlClientProvider>,
  );
}

describe("DetailsList", () => {
  it("marks every missing detail as a placeholder", () => {
    const { container } = renderList(empty);
    const marks = container.querySelectorAll("mark[data-placeholder]");
    expect(marks).toHaveLength(3);
    expect(screen.getByText("[Operator name — to be confirmed]")).toBeInTheDocument();
    expect(screen.getByText("[Contact email — to be confirmed]")).toBeInTheDocument();
    expect(screen.getByText("[Governing law — to be confirmed]")).toBeInTheDocument();
  });

  it("shows labels for each detail", () => {
    renderList(empty);
    expect(screen.getByText("Run by")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Governing law")).toBeInTheDocument();
  });

  it("shows filled details in the page's language, with a mailto link", () => {
    const { container } = renderList(filled, "ar");
    expect(container.querySelectorAll("mark[data-placeholder]")).toHaveLength(0);
    expect(screen.getByText("شركة فكّة")).toBeInTheDocument();
    expect(screen.getByText("قوانين مصر")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "privacy@example.com" });
    expect(link).toHaveAttribute("href", "mailto:privacy@example.com");
    expect(link).toHaveAttribute("dir", "ltr");
  });
});
