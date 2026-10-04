// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "check-release-env.mjs");

function run(envFile: string | null, env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "release-env-"));
  if (envFile !== null) writeFileSync(join(cwd, ".env.production"), envFile);
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
  });
}

describe("check-release-env", () => {
  it("fails and names every missing variable", () => {
    const result = run(null);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_WAITLIST_ENDPOINT");
    expect(result.stderr).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  });

  it("fails when only the endpoint is in .env.production", () => {
    const result = run("# comment\n\nNEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist\n");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    expect(result.stderr).not.toContain("NEXT_PUBLIC_WAITLIST_ENDPOINT");
  });

  it("passes with the file plus an environment variable", () => {
    const result = run("NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist\n", { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "key" });
    expect(result.status).toBe(0);
  });

  it("passes with both values in the file", () => {
    const result = run("NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist\nNEXT_PUBLIC_TURNSTILE_SITE_KEY=key\n");
    expect(result.status).toBe(0);
  });
});
