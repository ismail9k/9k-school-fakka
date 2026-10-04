// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import worker from "./index";
import type { Env } from "./env";

const env = {} as Env;
const ctx = { waitUntil: vi.fn() };

describe("worker entry", () => {
  it("returns JSON 404 for unknown API paths", async () => {
    const response = await worker.fetch(new Request("https://fakka.com/api/nope"), env, ctx);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("routes /api/waitlist and /api/waitlist/ to the handler", async () => {
    for (const path of ["/api/waitlist", "/api/waitlist/"]) {
      const response = await worker.fetch(new Request(`https://fakka.com${path}`), env, ctx);
      expect(response.status).toBe(405); // GET reaches the handler, which wants POST
    }
  });
});
