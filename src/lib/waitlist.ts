import type { Locale } from "@/i18n/routing";

export type WaitlistInput = {
  name: string;
  email: string;
  locale: Locale;
  ref: string | null;
};

export type WaitlistResult = { position: number; inviteUrl: string };

export type WaitlistMode =
  | { kind: "remote"; endpoint: string }
  | { kind: "stub" }
  | { kind: "unavailable" };

const STUB_DELAY_MS = 600;

// process.env.NEXT_PUBLIC_* must be read literally so Next can inline it at build time.
export function getWaitlistMode(
  env: { endpoint: string | undefined; nodeEnv: string | undefined } = {
    endpoint: process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT,
    nodeEnv: process.env.NODE_ENV,
  },
): WaitlistMode {
  if (env.endpoint) return { kind: "remote", endpoint: env.endpoint };
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
      inviteUrl.trim() === inviteUrl
    ) {
      try {
        const url = new URL(inviteUrl);
        if (url.protocol === "https:" || url.protocol === "http:") {
          return { position, inviteUrl };
        }
      } catch {
        // An invite link must be an absolute URL that can be shared.
      }
    }
  }
  throw new Error("Malformed waitlist response");
}

export async function submitWaitlist(input: WaitlistInput, mode: WaitlistMode): Promise<WaitlistResult> {
  if (mode.kind === "unavailable") throw new Error("Waitlist is not available");
  if (mode.kind === "stub") return submitToStub(input);

  const response = await fetch(mode.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Waitlist request failed: ${response.status}`);
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
