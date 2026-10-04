// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITEVERIFY_URL, verifyTurnstile } from "./turnstile";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetch = vi.fn(impl);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("verifyTurnstile", () => {
  it("posts secret, token and IP to siteverify and passes on success", async () => {
    const fetch = stubFetch(async () => Response.json({ success: true }));
    await expect(verifyTurnstile("tok", "sec", "1.2.3.4")).resolves.toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("secret")).toBe("sec");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("omits remoteip when unknown", async () => {
    const fetch = stubFetch(async () => Response.json({ success: true }));
    await verifyTurnstile("tok", "sec", null);
    expect((fetch.mock.calls[0][1].body as FormData).has("remoteip")).toBe(false);
  });

  it("fails when siteverify rejects the token", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] }));
    await expect(verifyTurnstile("tok", "sec", null)).resolves.toBe(false);
  });

  it("fails closed on a non-2xx response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(async () => new Response("down", { status: 503 }));
    await expect(verifyTurnstile("tok", "sec", null)).resolves.toBe(false);
  });

  it("fails closed on a network error or timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(verifyTurnstile("tok", "sec", null)).resolves.toBe(false);
  });

  it("fails closed on a non-JSON body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(async () => new Response("<html>", { status: 200 }));
    await expect(verifyTurnstile("tok", "sec", null)).resolves.toBe(false);
  });
});
