// Fails a production deploy unless the pushed tag is a real release: named
// v<version in package.json>, on a commit that is already in master. Without
// this, a tag on any branch would ship unreviewed code to production.
//
// Usage: node scripts/check-release-tag.mjs <tag>
// Needs master's history, so CI checks out with `fetch-depth: 0`.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PRODUCTION_REF = "origin/master";

function block(reason) {
  console.error(`Release blocked: ${reason}`);
  process.exit(1);
}

const tag = process.argv[2] ?? "";
if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  block(`"${tag}" is not a release tag. Use v<major>.<minor>.<patch>, for example v1.2.0.`);
}

const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
if (tag !== `v${version}`) {
  block(
    `tag ${tag} does not match version ${version} in package.json.\n` +
      "Bump the version on the release branch, then tag the commit that merges it into master.",
  );
}

// Exit code 0: HEAD is in master. 1: it is not. Anything else: git could not answer.
const inMaster = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", PRODUCTION_REF]);
if (inMaster.status === 1) {
  block(`${tag} is on a commit that is not in master.\nMerge the release branch into master, then tag that merge commit.`);
}
if (inMaster.status !== 0) {
  block(`could not compare ${tag} with ${PRODUCTION_REF}. Is this a full clone with master fetched?`);
}

console.log(`Release ${tag} matches package.json and is in master.`);
