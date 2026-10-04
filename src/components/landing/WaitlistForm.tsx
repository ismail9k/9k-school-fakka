"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type FormEventHandler,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import {
  getWaitlistMode,
  readRef,
  submitWaitlist,
  type WaitlistMode,
  type WaitlistResult,
} from "@/lib/waitlist";
import { formatNumber } from "@/lib/format";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error" }
  | { kind: "success"; result: WaitlistResult };

const fieldClass =
  "w-full rounded-xl border border-paper/25 bg-paper/10 px-4 py-3 text-paper placeholder:text-paper/50 outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-60";

export function WaitlistForm({ mode = getWaitlistMode() }: { mode?: WaitlistMode }) {
  const t = useTranslations("Waitlist");
  const locale = useLocale() as Locale;
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // State updates are async, so guard against a second submit in the same tick.
  const inFlight = useRef(false);
  // Server HTML renders disabled; a submit before hydration would do a native
  // GET and put the name and email in the URL.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => {
    rememberRef(readRef(window.location.search));
  }, []);

  if (status.kind === "success") {
    return <Success result={status.result} locale={locale} />;
  }

  const unavailable = mode.kind === "unavailable";
  const submitting = status.kind === "submitting";

  // Replace the browser's validation text with copy in the page's language.
  const handleInvalid: FormEventHandler<HTMLInputElement> = (event) => {
    const input = event.currentTarget;
    const { valueMissing, patternMismatch, typeMismatch } = input.validity;
    if (valueMissing || patternMismatch) {
      input.setCustomValidity(t(input.name === "name" ? "errors.nameMissing" : "errors.emailMissing"));
    } else if (typeMismatch) {
      input.setCustomValidity(t("errors.emailInvalid"));
    }
  };

  const clearCustomValidity: FormEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.setCustomValidity("");
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || unavailable) return;

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    if (data.get("website")) return;

    inFlight.current = true;
    setStatus({ kind: "submitting" });
    try {
      const result = await submitWaitlist(
        {
          name: String(data.get("name")).trim(),
          email: String(data.get("email")).trim(),
          locale,
          ref: readRef(window.location.search) ?? recallRef(),
        },
        mode,
      );
      setStatus({ kind: "success", result });
    } catch {
      setStatus({ kind: "error" });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl">
      <fieldset
        disabled={!hydrated || submitting || unavailable}
        className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <label className="grid gap-1.5 text-sm text-paper/90">
          {t("nameLabel")}
          <input
            name="name"
            required
            maxLength={80}
            pattern=".*\S.*"
            autoComplete="name"
            placeholder={t("namePlaceholder")}
            onInvalid={handleInvalid}
            onInput={clearCustomValidity}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1.5 text-sm text-paper/90">
          {t("emailLabel")}
          <input
            name="email"
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            onInvalid={handleInvalid}
            onInput={clearCustomValidity}
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-gold px-6 py-3 font-heading text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
        </button>
      </fieldset>

      {/* Honeypot: invisible to people and screen readers, tempting to bots. */}
      <div aria-hidden="true" className="sr-only">
        <label>
          {t("honeypot")}
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {status.kind === "error" && (
        <p role="alert" className="mt-4 text-sm text-gold">
          {t("error")}
        </p>
      )}
      {unavailable && <p className="mt-4 text-sm text-paper">{t("unavailable")}</p>}
      <p className="mt-4 text-xs text-paper/70">{t("privacy")}</p>
    </form>
  );
}

// Keep the invite code for this tab, so switching language (a plain link
// without the query) still credits the friend who invited.
const REF_KEY = "fakka.ref";

const subscribeNever = () => () => {};

function rememberRef(ref: string | null) {
  if (!ref) return;
  try {
    window.sessionStorage.setItem(REF_KEY, ref);
  } catch {}
}

function recallRef(): string | null {
  try {
    return window.sessionStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

function Success({ result, locale }: { result: WaitlistResult; locale: Locale }) {
  const t = useTranslations("Waitlist.success");
  const headingRef = useRef<HTMLParagraphElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const position = formatNumber(result.position, locale);

  // The form that had focus is gone; move focus to the result.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      linkRef.current?.select();
    }
  }

  return (
    <div role="status" className="max-w-xl rounded-2xl border border-paper/25 p-6">
      <p ref={headingRef} tabIndex={-1} className="font-heading text-4xl outline-none">
        {t.rich("position", {
          position,
          num: (chunks) => <span className="text-gold">{chunks}</span>,
        })}
      </p>
      <p className="mt-2 text-paper/80">{t("body")}</p>
      <div className="mt-5 flex items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm text-paper/90">
          {t("linkLabel")}
          <input
            ref={linkRef}
            readOnly
            value={result.inviteUrl}
            dir="ltr"
            onFocus={(event) => event.currentTarget.select()}
            className={`${fieldClass} text-sm`}
          />
        </label>
        <button
          type="button"
          onClick={copy}
          className="rounded-xl bg-gold px-4 py-3 font-heading text-ink transition-opacity hover:opacity-90"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );
}
