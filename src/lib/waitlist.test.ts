import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWaitlistMode,
  parseWaitlistResponse,
  readRef,
  submitWaitlist,
  type WaitlistInput,
  type WaitlistMode,
} from "./waitlist";

const input: WaitlistInput = {
  name: "Mona",
  email: "mona@example.com",
  locale: "ar",
  ref: "friend42",
};
const remote: WaitlistMode = { kind: "remote", endpoint: "https://api.example.com/waitlist" };

function stubFetch(impl: () => Promise<Response>) {
  const fetch = vi.fn(impl);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function json(body: unknown, status = 200) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getWaitlistMode", () => {
  it("uses the endpoint when one is configured", () => {
    expect(getWaitlistMode({ endpoint: "https://x.test/join", nodeEnv: "production" })).toEqual({
      kind: "remote",
      endpoint: "https://x.test/join",
    });
  });

  it("falls back to the stub in development", () => {
    expect(getWaitlistMode({ endpoint: undefined, nodeEnv: "development" })).toEqual({ kind: "stub" });
  });

  it("is unavailable in production without an endpoint", () => {
    expect(getWaitlistMode({ endpoint: undefined, nodeEnv: "production" })).toEqual({ kind: "unavailable" });
  });

  it("treats an empty endpoint as missing", () => {
    expect(getWaitlistMode({ endpoint: "", nodeEnv: "production" })).toEqual({ kind: "unavailable" });
  });
});

describe("readRef", () => {
  it("reads the ref parameter", () => {
    expect(readRef("?ref=friend42")).toBe("friend42");
  });

  it("finds ref among other parameters", () => {
    expect(readRef("?utm_source=wa&ref=k7Qm2x")).toBe("k7Qm2x");
  });

  it("trims whitespace", () => {
    expect(readRef("?ref=%20abc%20")).toBe("abc");
  });

  it("returns null when ref is missing or empty", () => {
    expect(readRef("")).toBeNull();
    expect(readRef("?ref=")).toBeNull();
    expect(readRef("?ref=%20%20")).toBeNull();
  });
});

describe("parseWaitlistResponse", () => {
  it("accepts a valid body", () => {
    expect(parseWaitlistResponse({ position: 1234, inviteUrl: "https://fakka.app/en/?ref=a" })).toEqual({
      position: 1234,
      inviteUrl: "https://fakka.app/en/?ref=a",
    });
  });

  it.each([
    ["null", null],
    ["a string", "ok"],
    ["missing position", { inviteUrl: "https://fakka.app/?ref=a" }],
    ["position as string", { position: "12", inviteUrl: "https://fakka.app/?ref=a" }],
    ["position zero", { position: 0, inviteUrl: "https://fakka.app/?ref=a" }],
    ["fractional position", { position: 1.5, inviteUrl: "https://fakka.app/?ref=a" }],
    ["missing inviteUrl", { position: 3 }],
    ["empty inviteUrl", { position: 3, inviteUrl: "" }],
  ])("rejects %s", (_label, body) => {
    expect(() => parseWaitlistResponse(body)).toThrow();
  });
});

describe("submitWaitlist", () => {
  it("POSTs the input as JSON to the endpoint and returns the result", async () => {
    const fetch = stubFetch(json({ position: 7, inviteUrl: "https://fakka.app/ar/?ref=m" }));

    await expect(submitWaitlist(input, remote)).resolves.toEqual({
      position: 7,
      inviteUrl: "https://fakka.app/ar/?ref=m",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/waitlist");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("rejects on a non-2xx response", async () => {
    stubFetch(json({ error: "nope" }, 500));
    await expect(submitWaitlist(input, remote)).rejects.toThrow();
  });

  it("rejects on a network failure", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(submitWaitlist(input, remote)).rejects.toThrow();
  });

  it("rejects on a malformed 200 body", async () => {
    stubFetch(json({ position: "first" }));
    await expect(submitWaitlist(input, remote)).rejects.toThrow();
  });

  it("rejects on a non-JSON 200 body", async () => {
    stubFetch(() => Promise.resolve(new Response("oops", { status: 200 })));
    await expect(submitWaitlist(input, remote)).rejects.toThrow();
  });

  it("resolves from the stub after a delay without calling fetch", async () => {
    vi.useFakeTimers();
    const fetch = stubFetch(json({}));

    const pending = submitWaitlist(input, { kind: "stub" });
    await vi.advanceTimersByTimeAsync(600);
    const result = await pending;

    expect(fetch).not.toHaveBeenCalled();
    expect(result.inviteUrl).toBe("https://example.com/ar/?ref=demo123");
    expect(Number.isInteger(result.position) && result.position > 0).toBe(true);
  });

  it("rejects when unavailable without calling fetch", async () => {
    const fetch = stubFetch(json({}));
    await expect(submitWaitlist(input, { kind: "unavailable" })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
