import type { Locale } from "@/i18n/routing";

export type WaitlistInput = {
  name: string;
  email: string;
  locale: Locale;
  ref: string | null;
  // Cloudflare Turnstile token; null only in stub mode.
  turnstileToken: string | null;
};

export type WaitlistResult = { position: number; inviteUrl: string };

export type WaitlistMode =
  | { kind: "remote"; endpoint: string; turnstileSiteKey: string }
  | { kind: "stub" }
  | { kind: "unavailable" };

export type WaitlistErrorReason = "rate_limited" | "verification" | "failed";

export class WaitlistError extends Error {
  reason: WaitlistErrorReason;
  constructor(reason: WaitlistErrorReason, message: string) {
    super(message);
    this.name = "WaitlistError";
    this.reason = reason;
  }
}

const STUB_DELAY_MS = 600;

// process.env.NEXT_PUBLIC_* must be read literally so Next can inline it at build time.
export function getWaitlistMode(
  env: { endpoint: string | undefined; siteKey: string | undefined; nodeEnv: string | undefined } = {
    endpoint: process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    nodeEnv: process.env.NODE_ENV,
  },
): WaitlistMode {
  if (env.endpoint) {
    // The backend refuses every request without a Turnstile token.
    return env.siteKey
      ? { kind: "remote", endpoint: env.endpoint, turnstileSiteKey: env.siteKey }
      : { kind: "unavailable" };
  }
  // Never show made-up queue numbers to real visitors.
  return env.nodeEnv === "development" ? { kind: "stub" } : { kind: "unavailable" };
}

export function readRef(search: string): string | null {
  const ref = new URLSearchParams(search).get("ref")?.trim();
  return ref ? ref : null;
}

export function parseWaitlistResponse(body: unknown): WaitlistResult {
  if (typeof body === "object" && body !== null) {
    const { position, inviteUrl } = body as Record<string, unknown>;
    if (
      typeof position === "number" &&
      Number.isInteger(position) &&
      position > 0 &&
      typeof inviteUrl === "string" &&
      inviteUrl !== ""
    ) {
      return { position, inviteUrl };
    }
  }
  throw new Error("Malformed waitlist response");
}

export async function submitWaitlist(input: WaitlistInput, mode: WaitlistMode): Promise<WaitlistResult> {
  if (mode.kind === "unavailable") throw new WaitlistError("failed", "Waitlist is not available");
  if (mode.kind === "stub") return submitToStub(input);

  const response = await fetch(mode.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const reason: WaitlistErrorReason =
      response.status === 429 ? "rate_limited" : response.status === 403 ? "verification" : "failed";
    throw new WaitlistError(reason, `Waitlist request failed: ${response.status}`);
  }
  return parseWaitlistResponse(await response.json());
}

function submitToStub({ locale }: WaitlistInput): Promise<WaitlistResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        position: 1 + Math.floor(Math.random() * 5000),
        inviteUrl: `https://example.com/${locale}/?ref=demo123`,
      });
    }, STUB_DELAY_MS);
  });
}
