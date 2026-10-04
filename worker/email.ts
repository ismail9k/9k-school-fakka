import type { Locale } from "../src/i18n/routing";
import { formatNumber } from "../src/lib/format";
import ar from "../messages/ar.json";
import en from "../messages/en.json";

export const RESEND_URL = "https://api.resend.com/emails";

export type ConfirmationEmail = {
  to: string;
  locale: Locale;
  position: number;
  inviteUrl: string;
};

const copy = { en: en.Email, ar: ar.Email };

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildConfirmationEmail({ locale, position, inviteUrl }: ConfirmationEmail) {
  const t = copy[locale];
  const values = { position: formatNumber(position, locale) };
  const subject = fill(t.subject, values);
  const lines = {
    greeting: fill(t.greeting, values),
    position: fill(t.position, values),
    invite: t.invite,
    linkLabel: t.linkLabel,
    launch: t.launch,
    signoff: t.signoff,
    footer: t.footer,
  };

  const text = [
    lines.greeting,
    lines.position,
    lines.invite,
    `${lines.linkLabel}\n${inviteUrl}`,
    lines.launch,
    lines.signoff,
    "—",
    lines.footer,
  ].join("\n\n");

  const e = (s: string) => escapeHtml(s);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<body style="margin:0;padding:24px;background:#f7f3ea;color:#1b2b22;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:520px;margin:0 auto">
<p>${e(lines.greeting)}</p>
<p style="font-size:22px;font-weight:bold">${e(lines.position)}</p>
<p>${e(lines.invite)}</p>
<p>${e(lines.linkLabel)}<br><a href="${e(inviteUrl)}" dir="ltr" style="color:#0f5a3c">${e(inviteUrl)}</a></p>
<p>${e(lines.launch)}</p>
<p>${e(lines.signoff)}</p>
<hr style="border:none;border-top:1px solid #d9d2c3">
<p style="font-size:12px;color:#5f6b63">${e(lines.footer)}</p>
</div>
</body>
</html>`;

  return { subject, html, text };
}

// Informational only: a failure is logged and never undoes the signup.
export async function sendConfirmationEmail(
  email: ConfirmationEmail,
  options: { apiKey: string | undefined; from: string; idempotencyKey: string },
): Promise<void> {
  if (!options.apiKey) {
    console.warn("RESEND_API_KEY is not set; skipping the confirmation email");
    return;
  }
  const { subject, html, text } = buildConfirmationEmail(email);
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ from: options.from, to: [email.to], subject, html, text }),
    });
    if (!response.ok) {
      console.error("Resend rejected the confirmation email", response.status, await response.text().catch(() => ""));
    }
  } catch (error) {
    console.error("Sending the confirmation email failed", error);
  }
}
