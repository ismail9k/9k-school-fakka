import { setRequestLocale } from "next-intl/server";
import { Faq } from "@/components/landing/Faq";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Join } from "@/components/landing/Join";
import { NextSteps } from "@/components/landing/NextSteps";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <Join />
        <Faq />
        <NextSteps />
      </main>
      <Footer />
    </>
  );
}
