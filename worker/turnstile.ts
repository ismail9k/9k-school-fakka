export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

// Fails closed: anything but a clear "success" from Cloudflare is a no.
export async function verifyTurnstile(token: string, secret: string, remoteIp: string | null): Promise<boolean> {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("Turnstile siteverify returned", response.status);
      return false;
    }
    const result = (await response.json()) as { success?: unknown; "error-codes"?: unknown };
    if (result.success === true) return true;
    console.warn("Turnstile rejected a token", result["error-codes"]);
    return false;
  } catch (error) {
    console.error("Turnstile siteverify failed", error);
    return false;
  }
}
