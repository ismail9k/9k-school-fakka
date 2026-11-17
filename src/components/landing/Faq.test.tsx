import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { Faq } from "./Faq";

function withIntl(node: React.ReactNode, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("Faq", () => {
  it("shows every question in the messages file", () => {
    withIntl(<Faq />);
    for (const { q, a } of Object.values(en.Faq.items)) {
      expect(screen.getByText(q)).toBeInTheDocument();
      expect(screen.getByText(a)).toBeInTheDocument();
    }
  });

  it("answers which emails a visitor will get, in both languages", () => {
    withIntl(<Faq />);
    expect(screen.getByText("What emails will I get?")).toBeInTheDocument();
    withIntl(<Faq />, "ar");
    expect(screen.getByText("هيوصلني إيميلات إيه؟")).toBeInTheDocument();
  });
});
