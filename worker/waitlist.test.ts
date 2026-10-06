// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESEND_URL } from "./email";
import type { Env, ExecutionContext } from "./env";
import { SITEVERIFY_URL } from "./turnstile";
import { handleWaitlist } from "./waitlist";
import { createTestD1 } from "./test/sqlite-d1";

let env: Env;
let pending: Promise<unknown>[];
let ctx: ExecutionContext;
let fetch: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let siteverify: () => Promise<Response>;
let resend: () => Promise<Response>;

const body = {
  name: "Mona",
  email: "Mona@Example.com",
  locale: "en",
  ref: null as string | null,
  turnstileToken: "tok",
};

function post(data: unknown = body, init: RequestInit = {}, url = "https://fakka.com/api/waitlist") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
    body: typeof data === "string" ? data : JSON.stringify(data),
    ...init,
  });
}

async function call(request: Request) {
  const response = await handleWaitlist(request, env, ctx);
  await Promise.all(pending);
  return { status: response.status, body: await response.json(), response };
}

async function count() {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM signups").first<{ n: number }>())!.n;
}

const resendCalls = () => fetch.mock.calls.filter(([url]) => url === RESEND_URL);

beforeEach(() => {
  env = {
    DB: createTestD1(),
    WAITLIST_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    SITE_URL: "https://fakka.com",
    EMAIL_FROM: "Fakka <hello@fakka.com>",
    REFERRAL_JUMP: "5",
    TURNSTILE_SECRET_KEY: "secret",
    RESEND_API_KEY: "re_test",
  };
  pending = [];
  ctx = { waitUntil: (p) => void pending.push(p) };
  siteverify = async () => Response.json({ success: true });
  resend = async () => Response.json({ id: "email-1" });
  fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) =>
    url === SITEVERIFY_URL ? siteverify() : resend(),
  );
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("handleWaitlist", () => {
  it("builds invite links on the request's own origin when SITE_URL is unset (previews)", async () => {
    env.SITE_URL = "";
    const { body: res } = await call(post(body, {}, "https://pr-8-fakka.example.workers.dev/api/waitlist"));
    expect(res.inviteUrl).toMatch(/^https:\/\/pr-8-fakka\.example\.workers\.dev\/en\/\?ref=[a-z2-9]{8}$/);
  });

  it("joins, returns position and invite link, and emails in the signup language", async () => {
    const { status, body: res, response } = await call(post({ ...body, locale: "ar" }));
    expect(status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(res.position).toBe(1);
    expect(res.inviteUrl).toMatch(/^https:\/\/fakka\.com\/ar\/\?ref=[a-z2-9]{8}$/);
    expect(resendCalls()).toHaveLength(1);
    const init = resendCalls()[0][1]!;
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toEqual(["Mona@Example.com"]);
    expect(sent.subject).toContain("فكّة");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^signup-\d+$/);
  });

  it("stores only the allowed fields", async () => {
    await call(post());
    const row = await env.DB.prepare("SELECT * FROM signups").first();
    expect(Object.keys(row!).sort()).toEqual(
      ["created_at", "email", "email_key", "id", "invite_code", "locale", "name", "referral_count", "referred_by"].sort(),
    );
    expect(row).toMatchObject({ name: "Mona", email: "Mona@Example.com", email_key: "mona@example.com", locale: "en" });
  });

  it("returns the same place for the same email typed differently, without a second email", async () => {
    const first = await call(post());
    const again = await call(post({ ...body, email: " mona+hi@EXAMPLE.com ", locale: "ar" }));
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await count()).toBe(1);
    expect(resendCalls()).toHaveLength(1);
  });

  it("moves the inviter up when a friend joins with their link", async () => {
    for (const p of ["a", "b", "c", "d", "e", "f"]) await call(post({ ...body, email: `${p}@example.com` }));
    const inviter = await call(post({ ...body, email: "inviter@example.com" })); // #7
    expect(inviter.body.position).toBe(7);
    const ref = new URL(inviter.body.inviteUrl).searchParams.get("ref");
    await call(post({ ...body, email: "friend@example.com", ref }));
    const after = await call(post({ ...body, email: "inviter@example.com" }));
    expect(after.body.position).toBe(3); // score 7 − 5 = 2 ties b, who joined earlier
  });

  it("does not credit an existing email re-submitting with a ref", async () => {
    const inviter = await call(post({ ...body, email: "inviter@example.com" }));
    await call(post({ ...body, email: "friend@example.com" }));
    const ref = new URL(inviter.body.inviteUrl).searchParams.get("ref");
    await call(post({ ...body, email: "friend@example.com", ref }));
    const row = await env.DB.prepare("SELECT referral_count FROM signups WHERE email_key = ?")
      .bind("inviter@example.com")
      .first();
    expect(row).toEqual({ referral_count: 0 });
  });

  it("rejects non-POST methods", async () => {
    const { status, body: res, response } = await call(new Request("https://fakka.com/api/waitlist"));
    expect(status).toBe(405);
    expect(res).toEqual({ error: "method_not_allowed" });
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("rate limits per IP before doing anything else", async () => {
    env.WAITLIST_LIMITER.limit = vi.fn(async () => ({ success: false }));
    const { status, body: res } = await call(post());
    expect(status).toBe(429);
    expect(res).toEqual({ error: "rate_limited" });
    expect(env.WAITLIST_LIMITER.limit).toHaveBeenCalledWith({ key: "1.2.3.4" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rate limits IPv6 visitors by their /64", async () => {
    await call(
      post(body, {
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "2001:db8:85a3::1234" },
      }),
    );
    expect(env.WAITLIST_LIMITER.limit).toHaveBeenCalledWith({ key: "2001:db8:85a3:0::/64" });
  });

  it.each([
    ["non-JSON", "{nope"],
    ["a JSON array", "[]"],
    ["a JSON string", '"hi"'],
    ["a missing email", JSON.stringify({ ...body, email: undefined })],
    ["an oversized body", JSON.stringify({ ...body, name: "a".repeat(5000) })],
  ])("returns 400 for %s and verifies nothing", async (_label, raw) => {
    const { status, body: res } = await call(post(raw));
    expect(status).toBe(400);
    expect(res).toEqual({ error: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it("stops reading a chunked body without Content-Length once it passes 4 KB", async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode("a".repeat(1024));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 1000) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const request = new Request("https://fakka.com/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("Content-Length")).toBeNull();

    const { status, body: res } = await call(request);

    expect(status).toBe(400);
    expect(res).toEqual({ error: "invalid_request" });
    expect(pulled).toBeLessThan(20);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a chunked body under 4 KB", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 10));
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    });
    const request = new Request("https://fakka.com/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: stream,
      duplex: "half",
    } as RequestInit);

    const { status } = await call(request);

    expect(status).toBe(200);
  });

  it("refuses and writes nothing when Turnstile rejects the token", async () => {
    siteverify = async () => Response.json({ success: false });
    const { status, body: res } = await call(post());
    expect(status).toBe(403);
    expect(res).toEqual({ error: "verification_failed" });
    expect(await count()).toBe(0);
  });

  it("refuses and writes nothing when Turnstile is unreachable", async () => {
    siteverify = async () => Promise.reject(new TypeError("fetch failed"));
    const { status } = await call(post());
    expect(status).toBe(403);
    expect(await count()).toBe(0);
  });

  it("fails with 500 when the Turnstile secret is missing", async () => {
    env.TURNSTILE_SECRET_KEY = undefined;
    const { status, body: res } = await call(post());
    expect(status).toBe(500);
    expect(res).toEqual({ error: "server_error" });
    expect(await count()).toBe(0);
  });

  it("still joins when the email provider is down", async () => {
    resend = async () => new Response("down", { status: 500 });
    const { status, body: res } = await call(post());
    expect(status).toBe(200);
    expect(res.position).toBe(1);
  });

  it("returns 500 without details when storage fails", async () => {
    env.DB = {
      prepare: () => {
        throw new Error("D1 is down: secret detail");
      },
      batch: async () => [],
    };
    const { status, body: res } = await call(post());
    expect(status).toBe(500);
    expect(res).toEqual({ error: "server_error" });
  });

  describe("when reading the position fails after the signup is saved", () => {
    // Fails the next `times` position queries, then lets them through.
    function failPositionReads(times: number) {
      const db = env.DB;
      let left = times;
      env.DB = {
        prepare(sql) {
          if (sql.includes("ROW_NUMBER") && left > 0) {
            left--;
            throw new Error("D1 hiccup");
          }
          return db.prepare(sql);
        },
        batch: (statements) => db.batch(statements),
      };
    }

    it("retries once and still answers and emails", async () => {
      failPositionReads(1);
      const { status, body: res } = await call(post());
      expect(status).toBe(200);
      expect(res.position).toBe(1);
      expect(resendCalls()).toHaveLength(1);
    });

    it("still sends the email when the request has to fail", async () => {
      failPositionReads(2);
      const { status, body: res } = await call(post());
      expect(status).toBe(500);
      expect(res).toEqual({ error: "server_error" });
      expect(resendCalls()).toHaveLength(1);
      const sent = JSON.parse(resendCalls()[0][1]!.body as string);
      expect(sent.subject).toContain("#1");
      // The retry finds the saved signup and gets the same place without a second email.
      const again = await call(post());
      expect(again.status).toBe(200);
      expect(resendCalls()).toHaveLength(1);
    });

    it("logs and gives up on the email when the position never comes back", async () => {
      failPositionReads(Infinity);
      const { status } = await call(post());
      expect(status).toBe(500);
      expect(resendCalls()).toHaveLength(0);
      expect(console.error).toHaveBeenCalled();
    });
  });

  it("uses the configured referral jump", async () => {
    env.REFERRAL_JUMP = "0";
    await call(post({ ...body, email: "a@example.com" }));
    const b = await call(post({ ...body, email: "b@example.com" }));
    const ref = new URL(b.body.inviteUrl).searchParams.get("ref");
    await call(post({ ...body, email: "c@example.com", ref }));
    const again = await call(post({ ...body, email: "b@example.com" }));
    expect(again.body.position).toBe(2);
  });
});
