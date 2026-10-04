import { readConfig } from "./config";
import { sendConfirmationEmail } from "./email";
import { emailKey } from "./email-key";
import type { Env, ExecutionContext } from "./env";
import { json } from "./http";
import { rateLimitKey } from "./rate-limit-key";
import { createSignup, getPosition } from "./store";
import { verifyTurnstile } from "./turnstile";
import { parseSignupRequest } from "./validate";

const MAX_BODY_BYTES = 4096;

// Reads the body as text, giving up as soon as it passes `limit` bytes, so a
// chunked request without Content-Length can't make us buffer all of it.
async function readBody(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const invalid = () => json({ error: "invalid_request" }, 400);
const serverError = () => json({ error: "server_error" }, 500);

// Check order matters: nothing is written before Turnstile passes.
export async function handleWaitlist(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });

  const ip = request.headers.get("CF-Connecting-IP");
  const { success } = await env.WAITLIST_LIMITER.limit({ key: rateLimitKey(ip) });
  if (!success) return json({ error: "rate_limited" }, 429);

  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES) return invalid();
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return invalid();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid();
  }
  const input = parseSignupRequest(parsed);
  if (!input) return invalid();

  if (!env.TURNSTILE_SECRET_KEY) {
    console.error("TURNSTILE_SECRET_KEY is not set");
    return serverError();
  }
  if (!(await verifyTurnstile(input.turnstileToken, env.TURNSTILE_SECRET_KEY, ip))) {
    return json({ error: "verification_failed" }, 403);
  }

  const config = readConfig(env);
  try {
    const { signup, created } = await createSignup(env.DB, {
      name: input.name,
      email: input.email,
      emailKey: emailKey(input.email),
      locale: input.locale,
      ref: input.ref,
      createdAt: new Date().toISOString(),
    });
    const position = await getPosition(env.DB, signup.id, config.referralJump);
    const inviteUrl = `${config.siteUrl}/${signup.locale}/?ref=${signup.inviteCode}`;

    if (created) {
      ctx.waitUntil(
        sendConfirmationEmail(
          { to: input.email, locale: signup.locale, position, inviteUrl },
          { apiKey: env.RESEND_API_KEY, from: config.emailFrom, idempotencyKey: `signup-${signup.id}` },
        ),
      );
    }

    return json({ position, inviteUrl }, 200);
  } catch (error) {
    console.error("Waitlist signup failed", error);
    return serverError();
  }
}
