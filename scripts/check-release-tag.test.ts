// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "check-release-tag.mjs");
const env = { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv;

// A repository at `version` whose first commit is what origin/master points at.
// `ahead` adds a second commit that master does not have.
function repo(version: string, { ahead = false, master = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "release-tag-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd, env });
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ version }));
  git("init", "--quiet", "--initial-branch=master");
  git("add", "package.json");
  git("commit", "--quiet", "-m", "release");
  if (master) git("update-ref", "refs/remotes/origin/master", "HEAD");
  if (ahead) git("commit", "--quiet", "--allow-empty", "-m", "not released yet");
  return cwd;
}

function run(cwd: string, tag: string) {
  return spawnSync(process.execPath, [script, tag], { cwd, encoding: "utf8", env });
}

describe("check-release-tag", () => {
  it("passes for a tag on master that matches package.json", () => {
    const result = run(repo("1.2.0"), "v1.2.0");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("blocks a tag that is not v<major>.<minor>.<patch>", () => {
    // The name is checked first, so this needs no repository.
    const cwd = mkdtempSync(join(tmpdir(), "release-tag-"));
    for (const tag of ["", "1.2.0", "v1.2", "v1.2.0-beta", "vnext"]) {
      const result = run(cwd, tag);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("is not a release tag");
    }
  });

  it("blocks a tag that does not match the version in package.json", () => {
    const result = run(repo("1.1.0"), "v1.2.0");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("v1.2.0");
    expect(result.stderr).toContain("1.1.0");
  });

  it("blocks a tag on a commit that is not in master", () => {
    const result = run(repo("1.2.0", { ahead: true }), "v1.2.0");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is not in master");
  });

  it("blocks when master was not fetched", () => {
    const result = run(repo("1.2.0", { master: false }), "v1.2.0");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("origin/master");
    expect(result.stderr).not.toContain("is not in master");
  });
});
