import { useLocale } from "next-intl";

export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  const locale = useLocale();

  return (
    <span className="flex items-baseline gap-2">
      <span lang="ar" className={`font-wordmark text-ink ${className}`}>
        فكّة
      </span>
      {locale !== "ar" && <span className="font-heading text-sm tracking-wide text-green-deep">Fakka</span>}
    </span>
  );
}
