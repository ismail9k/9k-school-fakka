// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConfirmationEmail, RESEND_URL, sendConfirmationEmail, type ConfirmationEmail } from "./email";

const en: ConfirmationEmail = {
  to: "mona@example.com",
  locale: "en",
  position: 1234,
  inviteUrl: "https://fakka.com/en/?ref=k7qm2x9a",
};
const ar: ConfirmationEmail = { ...en, locale: "ar", inviteUrl: "https://fakka.com/ar/?ref=k7qm2x9a" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildConfirmationEmail", () => {
  it("writes the English email with position and link", () => {
    const email = buildConfirmationEmail(en);
    expect(email.subject).toBe("You’re #1,234 on the Fakka waitlist");
    expect(email.text).toContain("Hi,");
    expect(email.text).toContain("You’re #1,234 in line for Fakka.");
    expect(email.text).toContain(en.inviteUrl);
    expect(email.html).toContain('lang="en"');
    expect(email.html).toContain('dir="ltr"');
    expect(email.html).toContain(`href="${en.inviteUrl}"`);
  });

  it("writes the Arabic email right to left with Arabic digits", () => {
    const email = buildConfirmationEmail(ar);
    expect(email.subject).toBe("إنت رقم ١٬٢٣٤ في دور فكّة");
    expect(email.text).toContain("أهلًا،");
    expect(email.html).toContain('lang="ar"');
    expect(email.html).toContain('dir="rtl"');
  });

  it("does not include the visitor's name", () => {
    const email = buildConfirmationEmail({ ...en, name: "Mona" } as ConfirmationEmail);
    expect(email.html).not.toContain("Mona");
    expect(email.text).not.toContain("Mona");
  });

  it("escapes the invite URL in the HTML body", () => {
    const email = buildConfirmationEmail({ ...en, inviteUrl: 'https://x.test/?a="><script>alert(1)</script>' });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes ampersands in the link", () => {
    const email = buildConfirmationEmail({ ...en, inviteUrl: "https://fakka.com/en/?a=1&ref=x" });
    expect(email.html).toContain('href="https://fakka.com/en/?a=1&amp;ref=x"');
  });
});

describe("sendConfirmationEmail", () => {
  const options = { apiKey: "re_test", from: "Fakka <hello@fakka.com>", idempotencyKey: "signup-7" };

  it("posts to Resend with auth, idempotency key and both bodies", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "abc" }));
    vi.stubGlobal("fetch", fetch);
    await sendConfirmationEmail(en, options);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer re_test",
      "Content-Type": "application/json",
      "Idempotency-Key": "signup-7",
    });
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Fakka <hello@fakka.com>");
    expect(body.to).toEqual(["mona@example.com"]);
    expect(body.subject).toBe("You’re #1,234 on the Fakka waitlist");
    expect(body.html).toContain(en.inviteUrl);
    expect(body.text).toContain(en.inviteUrl);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("skips sending without an API key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await sendConfirmationEmail(en, { ...options, apiKey: undefined });
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("logs and resolves when Resend rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    await expect(sendConfirmationEmail(en, options)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it("logs and resolves when the request times out", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("timed out", "TimeoutError"))));
    await expect(sendConfirmationEmail(en, options)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it("logs and resolves on a network failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(sendConfirmationEmail(en, options)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
