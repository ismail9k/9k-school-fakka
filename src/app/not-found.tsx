import Link from "next/link";

// Rendered for unknown URLs. The root layout is a pass-through, so this page
// provides its own <html>; it can't know the visitor's locale, so it's bilingual.
export default function NotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-bold">404</h1>
        <p>
          <Link href="/en/" className="underline">Home</Link>
          {" · "}
          <Link href="/ar/" lang="ar" dir="rtl" className="underline">الرئيسية</Link>
        </p>
      </body>
    </html>
  );
}
