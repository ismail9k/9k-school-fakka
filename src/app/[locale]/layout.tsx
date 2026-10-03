import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Sans } from "next/font/google";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, rtlLocales } from "@/i18n/routing";
import { localeSwitchScript } from "@/lib/locale-switch";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Only Regular exists for Thmanyah Sans; Arabic emphasis uses Serif Display.
const thmanyahSans = localFont({
  src: "../../fonts/thmanyah/thmanyahsans-Regular.woff2",
  weight: "400",
  variable: "--font-thmanyah-sans",
});

const thmanyahSerif = localFont({
  src: "../../fonts/thmanyah/thmanyahserifdisplay-Bold.woff2",
  weight: "700",
  variable: "--font-thmanyah-serif",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/`]),
      ),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={rtlLocales.includes(locale) ? "rtl" : "ltr"}
      data-scroll-behavior="smooth"
      className={`${plex.variable} ${thmanyahSans.variable} ${thmanyahSerif.variable} h-full antialiased motion-safe:scroll-smooth`}
    >
      <body className="flex min-h-full flex-col">
        <Script
          id="locale-switch-ref"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: localeSwitchScript }}
        />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
