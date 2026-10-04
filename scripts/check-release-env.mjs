// Fails a release build when the public Turnstile/endpoint vars are missing,
// because Next inlines them at build time and the form would ship disabled.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = ["NEXT_PUBLIC_WAITLIST_ENDPOINT", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"];

function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

const fromFile = readEnvFile(join(process.cwd(), ".env.production"));
const missing = REQUIRED.filter((key) => !(process.env[key] || fromFile[key]));

if (missing.length > 0) {
  console.error(
    `Release blocked: ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not set.\n` +
      "Set them in the environment or in .env.production; otherwise the sign-up form ships disabled.",
  );
  process.exit(1);
}
