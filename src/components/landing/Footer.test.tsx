import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { Footer } from "./Footer";
import { LocaleSwitch } from "./LocaleSwitch";

function withIntl(node: React.ReactNode, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("Footer", () => {
  it("links to the privacy and terms pages in the current language", () => {
    withIntl(<Footer />, "ar");
    const nav = screen.getByRole("navigation", { name: "روابط قانونية" });
    expect(within(nav).getByRole("link", { name: "الخصوصية" })).toHaveAttribute("href", "/ar/privacy/");
    expect(within(nav).getByRole("link", { name: "الشروط" })).toHaveAttribute("href", "/ar/terms/");
  });

  it("switches language to the same page", () => {
    withIntl(<Footer path="terms/" />);
    expect(screen.getByRole("link", { name: "العربية" })).toHaveAttribute("href", "/ar/terms/");
  });
});

describe("LocaleSwitch", () => {
  it("points at the other language's home by default", () => {
    withIntl(<LocaleSwitch />);
    expect(screen.getByRole("link", { name: "العربية" })).toHaveAttribute("href", "/ar/");
  });

  it("keeps the current page when given a path", () => {
    withIntl(<LocaleSwitch path="privacy/" />, "ar");
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/privacy/");
  });
});
