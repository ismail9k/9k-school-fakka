import type { Locale } from "../src/i18n/routing";

export type SignupRequest = {
  name: string;
  email: string;
  locale: Locale;
  ref: string | null;
  turnstileToken: string;
};

// No i, l, o, 0, 1: easy to read aloud and type from a screenshot.
export const INVITE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const INVITE_CODE_LENGTH = 8;

const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALES: readonly string[] = ["en", "ar"];
const MAX_NAME = 80;
const MAX_EMAIL = 254;
const MAX_TOKEN = 2048;

export function parseSignupRequest(body: unknown): SignupRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { name, email, locale, ref, turnstileToken } = body as Record<string, unknown>;

  if (typeof name !== "string") return null;
  const cleanName = name.replace(/\p{Cc}/gu, "").trim();
  if (cleanName === "" || cleanName.length > MAX_NAME) return null;

  if (typeof email !== "string") return null;
  const cleanEmail = email.trim();
  if (cleanEmail.length > MAX_EMAIL || !EMAIL_PATTERN.test(cleanEmail)) return null;

  if (typeof locale !== "string" || !LOCALES.includes(locale)) return null;

  if (typeof turnstileToken !== "string" || turnstileToken === "" || turnstileToken.length > MAX_TOKEN) {
    return null;
  }

  // A broken invite code shouldn't cost a visitor their signup.
  const cleanRef = typeof ref === "string" && INVITE_CODE_PATTERN.test(ref) ? ref : null;

  return { name: cleanName, email: cleanEmail, locale: locale as Locale, ref: cleanRef, turnstileToken };
}
