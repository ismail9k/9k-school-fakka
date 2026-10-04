# Waitlist Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve `POST /api/waitlist` from a Cloudflare Worker next to the static site: verified (Turnstile + rate limit) signups stored in D1, queue position with referral jumps, invite links, and a Resend confirmation email; update the form to send a Turnstile token.

**Architecture:** One Worker (`worker/index.ts`) added to the existing `wrangler.jsonc`; `assets.run_worker_first: ["/api/*"]` keeps pages on static assets. Small single-purpose modules under `worker/` (validation, email key, store, Turnstile, email, handler). Front end gains a `TurnstileWidget` and a `turnstileToken` field in the request.

**Tech Stack:** Cloudflare Workers + D1 + Rate Limiting binding, Wrangler 4.146, Resend REST API, Cloudflare Turnstile, Next.js 16 static export, next-intl, Vitest 5 (jsdom for UI, node for worker), `node:sqlite` (Node 24) for store tests.

**Spec:** `docs/superpowers/specs/2026-10-04-waitlist-backend-design.md`
Intent-Issue: #3 — https://github.com/ismail9k/9k-school-fakka/issues/3

## Global Constraints

- Store only: name, email, preferred language, join time, who invited whom (plus values derived from them: `email_key`, `invite_code`, `referral_count`). Never store IP, user agent, or Turnstile data.
- Nothing is written to D1 before Turnstile verification passes.
- Score = join order − N × referral_count; earlier join wins ties; N from var `REFERRAL_JUMP` (integer ≥ 0, default 5).
- Endpoint path `/api/waitlist` on the same origin; invite link `${SITE_URL}/${locale}/?ref=${invite_code}`; `SITE_URL=https://fakka.com`, `EMAIL_FROM=Fakka <hello@fakka.com>`.
- Invite code: 8 characters from alphabet `abcdefghjkmnpqrstuvwxyz23456789` (31 chars).
- Every user-facing string goes in both `messages/en.json` and `messages/ar.json`, written naturally per language (Egyptian Arabic, friendly; short plain English). Never promise a launch date, price, or feature.
- RTL-safe layouts: logical Tailwind utilities only (`ms-`, `pe-`, `start-`).
- Worker code must type-check under the root `tsconfig.json` (DOM lib, no generated Workers types): use the hand-written types in `worker/env.ts`. Use `import type` when importing from `src/` so no Next/next-intl runtime code is bundled into the Worker.
- Worker test files start with `// @vitest-environment node`.
- Test files must type-check: `pnpm exec tsc --noEmit` passes (`next build` type-checks every `.ts` file, tests included). Where the plan's test code needs a cast or a typed `vi.fn<...>()` to compile, add it without changing what the test asserts.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The same person submitting twice at the same moment (double click across tabs, retry) → exactly one row, both responses get the same position and link. Test in Task 2 (parallel `createSignup`).
2. Re-submitting an existing email (any casing/alias) with your own or someone else's `ref` → no referral credit, no second email. Tests in Task 2 and Task 4.
3. Garbage bodies (non-JSON, JSON array, oversized, wrong types) → 400, never 500. Test in Task 4.
4. Turnstile unreachable or timing out → 403 and nothing written (fail closed). Tests in Task 3 and Task 4.
5. Resend down or rejecting → signup still 200; a name containing `<script>` is escaped in the email. Tests in Task 3 and Task 4.

---

### Task 1: Worker input handling — env types, config, validation, email key

**Files:**
- Create: `worker/env.ts`, `worker/config.ts`, `worker/validate.ts`, `worker/email-key.ts`
- Test: `worker/config.test.ts`, `worker/validate.test.ts`, `worker/email-key.test.ts`

**Interfaces:**
- Produces:
  - `worker/env.ts`: `D1Result<T>`, `D1PreparedStatement`, `D1Database`, `RateLimit`, `ExecutionContext`, `Env` (exact code below).
  - `readConfig(env: Pick<Env, "SITE_URL" | "EMAIL_FROM" | "REFERRAL_JUMP">): Config` where `Config = { siteUrl: string; emailFrom: string; referralJump: number }`.
  - `parseSignupRequest(body: unknown): SignupRequest | null`, `SignupRequest = { name: string; email: string; locale: Locale; ref: string | null; turnstileToken: string }`, `INVITE_CODE_ALPHABET`, `INVITE_CODE_LENGTH`.
  - `emailKey(email: string): string`.

- [ ] **Step 1: Write `worker/env.ts`** (types only, no test)

```ts
// Minimal hand-written binding types. The root tsconfig uses the DOM lib, so
// the generated Workers runtime types would clash; these cover what we use.

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  // Runs the statements in one transaction: all succeed or none apply.
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  DB: D1Database;
  WAITLIST_LIMITER: RateLimit;
  SITE_URL: string;
  EMAIL_FROM: string;
  REFERRAL_JUMP: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
}
```

- [ ] **Step 2: Write failing tests**

`worker/config.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readConfig } from "./config";

const base = { SITE_URL: "https://fakka.com", EMAIL_FROM: "Fakka <hello@fakka.com>", REFERRAL_JUMP: "5" };

describe("readConfig", () => {
  it("reads the vars", () => {
    expect(readConfig(base)).toEqual({
      siteUrl: "https://fakka.com",
      emailFrom: "Fakka <hello@fakka.com>",
      referralJump: 5,
    });
  });

  it("drops trailing slashes from the site URL", () => {
    expect(readConfig({ ...base, SITE_URL: "https://fakka.com//" }).siteUrl).toBe("https://fakka.com");
  });

  it("accepts zero and other whole numbers for the referral jump", () => {
    expect(readConfig({ ...base, REFERRAL_JUMP: "0" }).referralJump).toBe(0);
    expect(readConfig({ ...base, REFERRAL_JUMP: " 12 " }).referralJump).toBe(12);
  });

  it.each(["", "abc", "-3", "2.5", "1e3"])("falls back to 5 for %j", (value) => {
    expect(readConfig({ ...base, REFERRAL_JUMP: value }).referralJump).toBe(5);
  });

  it("falls back to defaults when vars are missing", () => {
    expect(readConfig({} as typeof base)).toEqual({
      siteUrl: "https://fakka.com",
      emailFrom: "Fakka <hello@fakka.com>",
      referralJump: 5,
    });
  });
});
```

`worker/email-key.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emailKey } from "./email-key";

describe("emailKey", () => {
  it("lowercases and trims", () => {
    expect(emailKey("  Mona@Example.COM ")).toBe("mona@example.com");
  });

  it("drops a +tag for any domain", () => {
    expect(emailKey("mona+fakka@example.com")).toBe("mona@example.com");
    expect(emailKey("mona+a+b@outlook.com")).toBe("mona@outlook.com");
  });

  it("keeps a leading plus", () => {
    expect(emailKey("+mona@example.com")).toBe("+mona@example.com");
  });

  it("removes dots for Gmail only", () => {
    expect(emailKey("m.o.n.a@gmail.com")).toBe("mona@gmail.com");
    expect(emailKey("m.o.n.a@example.com")).toBe("m.o.n.a@example.com");
  });

  it("treats googlemail.com as gmail.com", () => {
    expect(emailKey("Mo.Na+x@GoogleMail.com")).toBe("mona@gmail.com");
  });

  it("strips a trailing dot from the domain", () => {
    expect(emailKey("mona@example.com.")).toBe("mona@example.com");
  });

  it("splits on the last @", () => {
    expect(emailKey('"a@b"@example.com')).toBe('"a@b"@example.com');
  });
});
```

`worker/validate.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSignupRequest } from "./validate";

const valid = {
  name: "Mona",
  email: "mona@example.com",
  locale: "ar",
  ref: "k7qm2x9a",
  turnstileToken: "tok",
};

describe("parseSignupRequest", () => {
  it("accepts a valid body", () => {
    expect(parseSignupRequest(valid)).toEqual(valid);
  });

  it("trims name and email and strips control characters from the name", () => {
    expect(parseSignupRequest({ ...valid, name: "  Mo\u0000na\n ", email: " mona@example.com " })).toMatchObject({
      name: "Mona",
      email: "mona@example.com",
    });
  });

  it("keeps Arabic names", () => {
    expect(parseSignupRequest({ ...valid, name: "منى" })?.name).toBe("منى");
  });

  it.each([
    ["null", null],
    ["an array", [valid]],
    ["a string", "hi"],
    ["missing name", { ...valid, name: undefined }],
    ["blank name", { ...valid, name: "   " }],
    ["long name", { ...valid, name: "a".repeat(81) }],
    ["numeric name", { ...valid, name: 42 }],
    ["missing email", { ...valid, email: undefined }],
    ["email without @", { ...valid, email: "mona.example.com" }],
    ["email without dot in domain", { ...valid, email: "mona@example" }],
    ["email with spaces", { ...valid, email: "mo na@example.com" }],
    ["long email", { ...valid, email: `${"a".repeat(250)}@x.co` }],
    ["unknown locale", { ...valid, locale: "fr" }],
    ["missing token", { ...valid, turnstileToken: undefined }],
    ["empty token", { ...valid, turnstileToken: "" }],
    ["long token", { ...valid, turnstileToken: "t".repeat(2049) }],
  ])("rejects %s", (_label, body) => {
    expect(parseSignupRequest(body)).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["wrong length", "abc"],
    ["ambiguous characters", "k7qm2x9l"],
    ["uppercase", "K7QM2X9A"],
    ["a number", 12345678],
  ])("treats a %s ref as no ref", (_label, ref) => {
    expect(parseSignupRequest({ ...valid, ref })?.ref).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run worker/`
Expected: FAIL — modules `./config`, `./email-key`, `./validate` not found.

- [ ] **Step 4: Implement**

`worker/config.ts`:

```ts
import type { Env } from "./env";

export type Config = { siteUrl: string; emailFrom: string; referralJump: number };

export const DEFAULT_REFERRAL_JUMP = 5;
const DEFAULT_SITE_URL = "https://fakka.com";
const DEFAULT_EMAIL_FROM = "Fakka <hello@fakka.com>";

export function readConfig(env: Pick<Env, "SITE_URL" | "EMAIL_FROM" | "REFERRAL_JUMP">): Config {
  const jump = env.REFERRAL_JUMP?.trim() ?? "";
  return {
    siteUrl: (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, ""),
    emailFrom: env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    // How many places each referral moves the inviter up. Changeable as a var.
    referralJump: /^\d+$/.test(jump) ? Number(jump) : DEFAULT_REFERRAL_JUMP,
  };
}
```

`worker/email-key.ts`:

```ts
// One person, one place: the key two spellings of the same inbox share.
// Expects an address that already passed validation.
export function emailKey(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1).replace(/\.+$/, "");

  if (domain === "googlemail.com") domain = "gmail.com";

  // Sub-addressing: mona+anything@ delivers to mona@ at most providers.
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);

  // Gmail ignores dots in the local part.
  if (domain === "gmail.com") local = local.replace(/\./g, "");

  return `${local}@${domain}`;
}
```

`worker/validate.ts`:

```ts
import type { Locale } from "../src/i18n/routing";

export type SignupRequest = {
  name: string;
  email: string;
  locale: Locale;
  ref: string | null;
  turnstileToken: string;
};

// No i, l, o, 0, 1: easy to read aloud and type from a screenshot.
export const INVITE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const INVITE_CODE_LENGTH = 8;

const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALES: readonly string[] = ["en", "ar"];
const MAX_NAME = 80;
const MAX_EMAIL = 254;
const MAX_TOKEN = 2048;

export function parseSignupRequest(body: unknown): SignupRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { name, email, locale, ref, turnstileToken } = body as Record<string, unknown>;

  if (typeof name !== "string") return null;
  const cleanName = name.replace(/\p{Cc}/gu, "").trim();
  if (cleanName === "" || cleanName.length > MAX_NAME) return null;

  if (typeof email !== "string") return null;
  const cleanEmail = email.trim();
  if (cleanEmail.length > MAX_EMAIL || !EMAIL_PATTERN.test(cleanEmail)) return null;

  if (typeof locale !== "string" || !LOCALES.includes(locale)) return null;

  if (typeof turnstileToken !== "string" || turnstileToken === "" || turnstileToken.length > MAX_TOKEN) {
    return null;
  }

  // A broken invite code shouldn't cost a visitor their signup.
  const cleanRef = typeof ref === "string" && INVITE_CODE_PATTERN.test(ref) ? ref : null;

  return { name: cleanName, email: cleanEmail, locale: locale as Locale, ref: cleanRef, turnstileToken };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run worker/`
Expected: PASS. If the shared `vitest.setup.ts` breaks in the node environment, make the setup file's DOM-only imports conditional (`if (typeof window !== "undefined")`) rather than changing test files.

- [ ] **Step 6: Commit**

```bash
git add worker/
git commit -m "feat(worker): add config, request validation and email key"
```

---

### Task 2: D1 schema and store

**Files:**
- Create: `migrations/0001_create_signups.sql`, `worker/store.ts`, `worker/test/sqlite-d1.ts`
- Test: `worker/store.test.ts`

**Interfaces:**
- Consumes: `D1Database`, `D1PreparedStatement`, `D1Result` from `worker/env.ts`; `INVITE_CODE_ALPHABET`, `INVITE_CODE_LENGTH` from `worker/validate.ts`.
- Produces:
  - `type Signup = { id: number; locale: Locale; inviteCode: string }`
  - `type SignupInput = { name: string; email: string; emailKey: string; locale: Locale; ref: string | null; createdAt: string }`
  - `createSignup(db: D1Database, input: SignupInput, generateCode?: () => string): Promise<{ signup: Signup; created: boolean }>`
  - `getPosition(db: D1Database, id: number, referralJump: number): Promise<number>`
  - `generateInviteCode(): string`
  - Test helper `createTestD1(): D1Database` in `worker/test/sqlite-d1.ts`.

- [ ] **Step 1: Write the migration**

`migrations/0001_create_signups.sql`:

```sql
-- Only what the waitlist needs (see docs/faka-product-brief.md, Privacy).
CREATE TABLE signups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT, -- join order
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,                  -- as typed, used to send
  email_key      TEXT    NOT NULL UNIQUE,           -- normalized: one person, one place
  locale         TEXT    NOT NULL CHECK (locale IN ('en', 'ar')),
  invite_code    TEXT    NOT NULL UNIQUE,
  referred_by    INTEGER REFERENCES signups (id),   -- who invited whom
  referral_count INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL                   -- ISO 8601 join time
);
```

- [ ] **Step 2: Write the SQLite-backed D1 test helper**

`worker/test/sqlite-d1.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { D1Database, D1PreparedStatement, D1Result } from "../env";

// node:sqlite (Node 22.5+) has no types in @types/node 20, so describe the
// little we use.
type SqliteStatement = {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): unknown;
};
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

// An in-memory database with the real migrations applied, behind the subset
// of the D1 API the Worker uses.
export function createTestD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }

  class Statement implements D1PreparedStatement {
    constructor(
      readonly sql: string,
      readonly params: unknown[] = [],
    ) {}
    bind(...values: unknown[]) {
      return new Statement(this.sql, values);
    }
    async first<T>() {
      const row = db.prepare(this.sql).get(...this.params);
      return (row ? { ...row } : null) as T | null;
    }
    async all<T>() {
      return this.allSync<T>();
    }
    async run() {
      return this.runSync();
    }
    allSync<T>(): D1Result<T> {
      return { results: db.prepare(this.sql).all(...this.params).map((r) => ({ ...r }) as T), success: true };
    }
    runSync(): D1Result {
      db.prepare(this.sql).run(...this.params);
      return { results: [], success: true };
    }
  }

  return {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map((s) => (s as Statement).runSync());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
```

- [ ] **Step 3: Write failing tests**

`worker/store.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { D1Database } from "./env";
import { createSignup, generateInviteCode, getPosition, type SignupInput } from "./store";
import { createTestD1 } from "./test/sqlite-d1";

let db: D1Database;
let n = 0;

function person(id: string, ref: string | null = null): SignupInput {
  return {
    name: id,
    email: `${id}@example.com`,
    emailKey: `${id}@example.com`,
    locale: "en",
    ref,
    createdAt: new Date(2026, 9, 4, 0, 0, n++).toISOString(),
  };
}

async function join(id: string, ref: string | null = null) {
  return (await createSignup(db, person(id, ref))).signup;
}

async function positions(...ids: number[]) {
  return Promise.all(ids.map((id) => getPosition(db, id, 5)));
}

beforeEach(() => {
  db = createTestD1();
});

describe("generateInviteCode", () => {
  it("makes 8 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    }
  });
});

describe("createSignup", () => {
  it("creates a signup with its locale and an invite code", async () => {
    const { signup, created } = await createSignup(db, { ...person("mona"), locale: "ar" });
    expect(created).toBe(true);
    expect(signup.locale).toBe("ar");
    expect(signup.inviteCode).toMatch(/^[a-z2-9]{8}$/);
  });

  it("returns the existing entry for the same email key without changing it", async () => {
    const first = await join("mona");
    const again = await createSignup(db, { ...person("mona"), name: "Other", locale: "ar" });
    expect(again).toEqual({ signup: first, created: false });
    const row = await db.prepare("SELECT name, locale FROM signups").first();
    expect(row).toEqual({ name: "mona", locale: "en" });
  });

  it("credits the inviter once when a new person joins with their code", async () => {
    const inviter = await join("a");
    await join("b", inviter.inviteCode);
    const row = await db.prepare("SELECT referral_count FROM signups WHERE id = ?").bind(inviter.id).first();
    expect(row).toEqual({ referral_count: 1 });
    const friend = await db.prepare("SELECT referred_by FROM signups WHERE email_key = ?").bind("b@example.com").first();
    expect(friend).toEqual({ referred_by: inviter.id });
  });

  it("does not credit anyone when an existing email submits again with a ref", async () => {
    const inviter = await join("a");
    await join("b");
    await createSignup(db, person("b", inviter.inviteCode));
    const row = await db.prepare("SELECT referral_count FROM signups WHERE id = ?").bind(inviter.id).first();
    expect(row).toEqual({ referral_count: 0 });
  });

  it("does not credit you for re-submitting with your own code", async () => {
    const me = await join("a");
    await createSignup(db, person("a", me.inviteCode));
    const row = await db.prepare("SELECT referral_count FROM signups WHERE id = ?").bind(me.id).first();
    expect(row).toEqual({ referral_count: 0 });
  });

  it("ignores an unknown ref", async () => {
    const { created } = await createSignup(db, person("a", "zzzzzzzz"));
    expect(created).toBe(true);
    const row = await db.prepare("SELECT referred_by FROM signups").first();
    expect(row).toEqual({ referred_by: null });
  });

  it("keeps one row when the same person joins twice at the same moment", async () => {
    const [x, y] = await Promise.all([createSignup(db, person("a")), createSignup(db, person("a"))]);
    expect(x.signup).toEqual(y.signup);
    expect([x.created, y.created].sort()).toEqual([false, true]);
    const row = await db.prepare("SELECT COUNT(*) AS n FROM signups").first();
    expect(row).toEqual({ n: 1 });
  });

  it("retries with a new code when the invite code collides", async () => {
    await createSignup(db, person("a"), () => "aaaaaaaa");
    const codes = ["aaaaaaaa", "bbbbbbbb"];
    const { signup } = await createSignup(db, person("b"), () => codes.shift()!);
    expect(signup.inviteCode).toBe("bbbbbbbb");
  });

  it("gives up after three collisions", async () => {
    await createSignup(db, person("a"), () => "aaaaaaaa");
    await expect(createSignup(db, person("b"), () => "aaaaaaaa")).rejects.toThrow();
    const row = await db.prepare("SELECT COUNT(*) AS n FROM signups").first();
    expect(row).toEqual({ n: 1 });
  });
});

describe("getPosition", () => {
  it("orders by join order without referrals", async () => {
    const ids: number[] = [];
    for (const p of ["a", "b", "c"]) ids.push((await join(p)).id);
    expect(await positions(...ids)).toEqual([1, 2, 3]);
  });

  it("moves an inviter up N places per referral", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 9; i++) ids.push((await join(`p${i}`)).id);
    const last = (await join("late")).id; // join order 10
    const lateCode = (await db.prepare("SELECT invite_code FROM signups WHERE id = ?").bind(last).first<{ invite_code: string }>())!.invite_code;
    await join("friend", lateCode); // join order 11; late's score 10 - 5 = 5
    // Scores: p0..p8 → 1..9, late → 5, friend → 11. Tie with p4 (score 5): p4 joined earlier.
    expect(await getPosition(db, last, 5)).toBe(6);
    expect(await getPosition(db, ids[4], 5)).toBe(5);
    expect(await getPosition(db, ids[5], 5)).toBe(7);
  });

  it("uses the configured jump", async () => {
    await join("a");
    await join("b");
    const c = await join("c");
    await join("d", c.inviteCode);
    // c joined third with one referral: score = 3 − jump. Scores: a 1, b 2, d 4.
    expect(await getPosition(db, c.id, 0)).toBe(3); // score 3
    expect(await getPosition(db, c.id, 1)).toBe(3); // score 2 ties b; b joined earlier
    expect(await getPosition(db, c.id, 2)).toBe(2); // score 1 ties a; a joined earlier
    expect(await getPosition(db, c.id, 3)).toBe(1); // score 0 beats everyone
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm vitest run worker/store.test.ts`
Expected: FAIL — module `./store` not found.

- [ ] **Step 5: Implement `worker/store.ts`**

```ts
import type { Locale } from "../src/i18n/routing";
import type { D1Database } from "./env";
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "./validate";

export type Signup = { id: number; locale: Locale; inviteCode: string };

export type SignupInput = {
  name: string;
  email: string;
  emailKey: string;
  locale: Locale;
  ref: string | null;
  createdAt: string;
};

type SignupRow = { id: number; locale: Locale; invite_code: string };

const MAX_CODE_ATTEMPTS = 3;
// Largest multiple of the alphabet size that fits in a byte, to avoid modulo bias.
const BYTE_LIMIT = 256 - (256 % INVITE_CODE_ALPHABET.length);

export function generateInviteCode(): string {
  let code = "";
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH))) {
      if (byte < BYTE_LIMIT && code.length < INVITE_CODE_LENGTH) {
        code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
      }
    }
  }
  return code;
}

async function findByEmailKey(db: D1Database, key: string): Promise<Signup | null> {
  const row = await db
    .prepare("SELECT id, locale, invite_code FROM signups WHERE email_key = ?")
    .bind(key)
    .first<SignupRow>();
  return row && { id: row.id, locale: row.locale, inviteCode: row.invite_code };
}

async function findInviterId(db: D1Database, code: string): Promise<number | null> {
  const row = await db.prepare("SELECT id FROM signups WHERE invite_code = ?").bind(code).first<{ id: number }>();
  return row?.id ?? null;
}

// Returns the existing entry when the email is already on the list: one person,
// one place, and a second submission never credits a referral.
export async function createSignup(
  db: D1Database,
  input: SignupInput,
  generateCode: () => string = generateInviteCode,
): Promise<{ signup: Signup; created: boolean }> {
  const existing = await findByEmailKey(db, input.emailKey);
  if (existing) return { signup: existing, created: false };

  const inviterId = input.ref ? await findInviterId(db, input.ref) : null;

  for (let attempt = 1; ; attempt++) {
    const insert = db
      .prepare(
        `INSERT INTO signups (name, email, email_key, locale, invite_code, referred_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(input.name, input.email, input.emailKey, input.locale, generateCode(), inviterId, input.createdAt);
    const statements = [insert];
    if (inviterId !== null) {
      statements.push(
        db.prepare("UPDATE signups SET referral_count = referral_count + 1 WHERE id = ?").bind(inviterId),
      );
    }

    try {
      // One transaction: the referral counts only if the new signup is written.
      await db.batch(statements);
    } catch (error) {
      // Either the same email won a race (return it) or the code collided (retry).
      const raced = await findByEmailKey(db, input.emailKey);
      if (raced) return { signup: raced, created: false };
      if (attempt >= MAX_CODE_ATTEMPTS) throw error;
      continue;
    }

    const signup = await findByEmailKey(db, input.emailKey);
    if (!signup) throw new Error("Signup vanished after insert");
    return { signup, created: true };
  }
}

// Score = join order − jump × referrals; lower is better, earlier join wins ties.
// Join order is the rank by id, so AUTOINCREMENT gaps don't shift anyone.
export async function getPosition(db: D1Database, id: number, referralJump: number): Promise<number> {
  const row = await db
    .prepare(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id) - ? * referral_count AS score
         FROM signups
       ),
       me AS (SELECT id AS me_id, score AS me_score FROM ranked WHERE id = ?)
       SELECT COUNT(*) + 1 AS position
       FROM ranked, me
       WHERE ranked.score < me.me_score
          OR (ranked.score = me.me_score AND ranked.id < me.me_id)`,
    )
    .bind(referralJump, id)
    .first<{ position: number }>();
  if (!row) throw new Error("Position query returned nothing");
  return row.position;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run worker/store.test.ts`
Expected: PASS (an `ExperimentalWarning` about SQLite on stderr is fine).

- [ ] **Step 7: Commit**

```bash
git add migrations/ worker/store.ts worker/store.test.ts worker/test/
git commit -m "feat(worker): add signups schema, store and queue position"
```

---

### Task 3: External services — Turnstile verification and confirmation email

**Files:**
- Create: `worker/turnstile.ts`, `worker/email.ts`
- Modify: `messages/en.json`, `messages/ar.json` (add top-level `Email` namespace)
- Test: `worker/turnstile.test.ts`, `worker/email.test.ts`

**Interfaces:**
- Consumes: `formatNumber(value, locale)` from `src/lib/format.ts`.
- Produces:
  - `SITEVERIFY_URL`, `verifyTurnstile(token: string, secret: string, remoteIp: string | null): Promise<boolean>`
  - `type ConfirmationEmail = { to: string; name: string; locale: Locale; position: number; inviteUrl: string }`
  - `buildConfirmationEmail(email: ConfirmationEmail): { subject: string; html: string; text: string }`
  - `RESEND_URL`, `sendConfirmationEmail(email: ConfirmationEmail, options: { apiKey: string | undefined; from: string; idempotencyKey: string }): Promise<void>` — never throws.

- [ ] **Step 1: Add email copy**

Add to `messages/en.json` (top level, after `Waitlist`):

```json
  "Email": {
    "subject": "You’re #{position} on the Fakka waitlist",
    "greeting": "Hi {name},",
    "position": "You’re #{position} in line for Fakka.",
    "invite": "Want to move up? Share your invite link. Each friend who joins with it moves you up the queue.",
    "linkLabel": "Your invite link:",
    "launch": "We’ll email you when Fakka is ready. There’s no date yet, but you’ll hear it from us first.",
    "signoff": "The Fakka team",
    "footer": "You’re getting this because you joined the Fakka waitlist on fakka.com. We only email you about Fakka’s launch, and we never share your details."
  },
```

Add to `messages/ar.json` (same place):

```json
  "Email": {
    "subject": "إنت رقم {position} في دور فكّة",
    "greeting": "أهلًا {name}،",
    "position": "إنت رقم {position} في الدور على فكّة.",
    "invite": "عايز تتقدّم؟ ابعت لينك الدعوة بتاعك لصحابك. كل واحد يسجّل منه بيقدّمك في الدور.",
    "linkLabel": "لينك الدعوة بتاعك:",
    "launch": "هنبعتلك أول ما فكّة تبقى جاهزة. لسه مفيش ميعاد، بس هتعرفه مننا الأول.",
    "signoff": "فريق فكّة",
    "footer": "الإيميل ده وصلك علشان سجّلت في قائمة انتظار فكّة على fakka.com. مش هنبعتلك غير عن إطلاق فكّة، ومش هنشارك بياناتك مع حد."
  },
```

- [ ] **Step 2: Write failing tests**

`worker/turnstile.test.ts`:

```ts
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
```

`worker/email.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConfirmationEmail, RESEND_URL, sendConfirmationEmail, type ConfirmationEmail } from "./email";

const en: ConfirmationEmail = {
  to: "mona@example.com",
  name: "Mona",
  locale: "en",
  position: 1234,
  inviteUrl: "https://fakka.com/en/?ref=k7qm2x9a",
};
const ar: ConfirmationEmail = { ...en, name: "منى", locale: "ar", inviteUrl: "https://fakka.com/ar/?ref=k7qm2x9a" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildConfirmationEmail", () => {
  it("writes the English email with position and link", () => {
    const email = buildConfirmationEmail(en);
    expect(email.subject).toBe("You’re #1,234 on the Fakka waitlist");
    expect(email.text).toContain("Hi Mona,");
    expect(email.text).toContain("You’re #1,234 in line for Fakka.");
    expect(email.text).toContain(en.inviteUrl);
    expect(email.html).toContain('lang="en"');
    expect(email.html).toContain('dir="ltr"');
    expect(email.html).toContain(`href="${en.inviteUrl}"`);
  });

  it("writes the Arabic email right to left with Arabic digits", () => {
    const email = buildConfirmationEmail(ar);
    expect(email.subject).toBe("إنت رقم ١٬٢٣٤ في دور فكّة");
    expect(email.text).toContain("أهلًا منى،");
    expect(email.html).toContain('lang="ar"');
    expect(email.html).toContain('dir="rtl"');
  });

  it("escapes the name in the HTML body", () => {
    const email = buildConfirmationEmail({ ...en, name: '<script>alert("x")</script>' });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
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
    expect(body.html).toContain("Mona");
    expect(body.text).toContain("Mona");
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

  it("logs and resolves on a network failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(sendConfirmationEmail(en, options)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run worker/turnstile.test.ts worker/email.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`worker/turnstile.ts`:

```ts
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

// Fails closed: anything but a clear "success" from Cloudflare is a no.
export async function verifyTurnstile(token: string, secret: string, remoteIp: string | null): Promise<boolean> {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("Turnstile siteverify returned", response.status);
      return false;
    }
    const result = (await response.json()) as { success?: unknown; "error-codes"?: unknown };
    if (result.success === true) return true;
    console.warn("Turnstile rejected a token", result["error-codes"]);
    return false;
  } catch (error) {
    console.error("Turnstile siteverify failed", error);
    return false;
  }
}
```

`worker/email.ts`:

```ts
import type { Locale } from "../src/i18n/routing";
import { formatNumber } from "../src/lib/format";
import ar from "../messages/ar.json";
import en from "../messages/en.json";

export const RESEND_URL = "https://api.resend.com/emails";

export type ConfirmationEmail = {
  to: string;
  name: string;
  locale: Locale;
  position: number;
  inviteUrl: string;
};

const copy = { en: en.Email, ar: ar.Email };

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildConfirmationEmail({ name, locale, position, inviteUrl }: ConfirmationEmail) {
  const t = copy[locale];
  const values = { name, position: formatNumber(position, locale) };
  const subject = fill(t.subject, values);
  const lines = {
    greeting: fill(t.greeting, values),
    position: fill(t.position, values),
    invite: t.invite,
    linkLabel: t.linkLabel,
    launch: t.launch,
    signoff: t.signoff,
    footer: t.footer,
  };

  const text = [
    lines.greeting,
    lines.position,
    lines.invite,
    `${lines.linkLabel}\n${inviteUrl}`,
    lines.launch,
    lines.signoff,
    "—",
    lines.footer,
  ].join("\n\n");

  const e = (s: string) => escapeHtml(s);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<body style="margin:0;padding:24px;background:#f7f3ea;color:#1b2b22;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:520px;margin:0 auto">
<p>${e(lines.greeting)}</p>
<p style="font-size:22px;font-weight:bold">${e(lines.position)}</p>
<p>${e(lines.invite)}</p>
<p>${e(lines.linkLabel)}<br><a href="${e(inviteUrl)}" dir="ltr" style="color:#0f5a3c">${e(inviteUrl)}</a></p>
<p>${e(lines.launch)}</p>
<p>${e(lines.signoff)}</p>
<hr style="border:none;border-top:1px solid #d9d2c3">
<p style="font-size:12px;color:#5f6b63">${e(lines.footer)}</p>
</div>
</body>
</html>`;

  return { subject, html, text };
}

// Informational only: a failure is logged and never undoes the signup.
export async function sendConfirmationEmail(
  email: ConfirmationEmail,
  options: { apiKey: string | undefined; from: string; idempotencyKey: string },
): Promise<void> {
  if (!options.apiKey) {
    console.warn("RESEND_API_KEY is not set; skipping the confirmation email");
    return;
  }
  const { subject, html, text } = buildConfirmationEmail(email);
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({ from: options.from, to: [email.to], subject, html, text }),
    });
    if (!response.ok) {
      console.error("Resend rejected the confirmation email", response.status, await response.text().catch(() => ""));
    }
  } catch (error) {
    console.error("Sending the confirmation email failed", error);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run worker/turnstile.test.ts worker/email.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/turnstile.ts worker/turnstile.test.ts worker/email.ts worker/email.test.ts messages/
git commit -m "feat(worker): verify Turnstile tokens and send the confirmation email"
```

---

### Task 4: Waitlist handler, Worker entry, and Cloudflare config

**Files:**
- Create: `worker/http.ts`, `worker/waitlist.ts`, `worker/index.ts`, `.dev.vars.example`
- Modify: `wrangler.jsonc`, `package.json` (scripts), `.gitignore`
- Test: `worker/waitlist.test.ts`, `worker/index.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3 (`Env`, `ExecutionContext`, `readConfig`, `parseSignupRequest`, `emailKey`, `createSignup`, `getPosition`, `verifyTurnstile`, `sendConfirmationEmail`), `createTestD1` for tests.
- Produces: `json(body: unknown, status: number, headers?: Record<string, string>): Response`; `handleWaitlist(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>`; default export `{ fetch(request, env, ctx) }` from `worker/index.ts`.

- [ ] **Step 1: Write failing tests**

`worker/waitlist.test.ts`:

```ts
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
let fetch: ReturnType<typeof vi.fn>;
let siteverify: () => Promise<Response>;
let resend: () => Promise<Response>;

const body = {
  name: "Mona",
  email: "Mona@Example.com",
  locale: "en",
  ref: null as string | null,
  turnstileToken: "tok",
};

function post(data: unknown = body, init: RequestInit = {}) {
  return new Request("https://fakka.com/api/waitlist", {
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
  fetch = vi.fn(async (url: string) => (url === SITEVERIFY_URL ? siteverify() : resend()));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("handleWaitlist", () => {
  it("joins, returns position and invite link, and emails in the signup language", async () => {
    const { status, body: res, response } = await call(post({ ...body, locale: "ar" }));
    expect(status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(res.position).toBe(1);
    expect(res.inviteUrl).toMatch(/^https:\/\/fakka\.com\/ar\/\?ref=[a-z2-9]{8}$/);
    expect(resendCalls()).toHaveLength(1);
    const sent = JSON.parse(resendCalls()[0][1].body);
    expect(sent.to).toEqual(["Mona@Example.com"]);
    expect(sent.subject).toContain("فكّة");
    expect(resendCalls()[0][1].headers["Idempotency-Key"]).toMatch(/^signup-\d+$/);
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
```

`worker/index.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run worker/waitlist.test.ts worker/index.test.ts`
Expected: FAIL — modules `./waitlist`, `./index` not found.

- [ ] **Step 3: Implement**

`worker/http.ts`:

```ts
export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}
```

`worker/waitlist.ts`:

```ts
import { readConfig } from "./config";
import { sendConfirmationEmail } from "./email";
import { emailKey } from "./email-key";
import type { Env, ExecutionContext } from "./env";
import { json } from "./http";
import { createSignup, getPosition } from "./store";
import { verifyTurnstile } from "./turnstile";
import { parseSignupRequest } from "./validate";

const MAX_BODY_BYTES = 4096;

const invalid = () => json({ error: "invalid_request" }, 400);
const serverError = () => json({ error: "server_error" }, 500);

// Check order matters: nothing is written before Turnstile passes.
export async function handleWaitlist(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });

  const ip = request.headers.get("CF-Connecting-IP");
  const { success } = await env.WAITLIST_LIMITER.limit({ key: ip ?? "unknown" });
  if (!success) return json({ error: "rate_limited" }, 429);

  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES) return invalid();
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return invalid();

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
          { to: input.email, name: input.name, locale: signup.locale, position, inviteUrl },
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
```

`worker/index.ts`:

```ts
import type { Env, ExecutionContext } from "./env";
import { json } from "./http";
import { handleWaitlist } from "./waitlist";

// Only /api/* reaches this script (assets.run_worker_first in wrangler.jsonc);
// every page is served straight from the static export in ./out.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/waitlist" || pathname === "/api/waitlist/") {
      return handleWaitlist(request, env, ctx);
    }
    return json({ error: "not_found" }, 404);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run worker/ && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Cloudflare config, scripts, local secrets**

Replace `wrangler.jsonc` with:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "fakka",
  "compatibility_date": "2026-10-03",
  // The waitlist API. Only /api/* runs it; everything else is static assets.
  "main": "worker/index.ts",
  "assets": {
    "directory": "./out",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      // Create with `wrangler d1 create fakka-waitlist` and add its
      // database_id here before the first remote deploy.
      "binding": "DB",
      "database_name": "fakka-waitlist"
    }
  ],
  "ratelimits": [
    {
      // Per-IP limit on sign-up attempts.
      "name": "WAITLIST_LIMITER",
      "namespace_id": "1001",
      "simple": { "limit": 5, "period": 60 }
    }
  ],
  "vars": {
    "SITE_URL": "https://fakka.com",
    "EMAIL_FROM": "Fakka <hello@fakka.com>",
    // Places each referral moves the inviter up the queue.
    "REFERRAL_JUMP": "5"
  },
  // Secrets (wrangler secret put): TURNSTILE_SECRET_KEY, RESEND_API_KEY
  "observability": { "enabled": true }
}
```

In `package.json` `scripts`, replace `preview` and `deploy` and add the two migration scripts:

```json
    "preview": "next build && wrangler d1 migrations apply fakka-waitlist --local && wrangler dev",
    "deploy": "next build && wrangler d1 migrations apply fakka-waitlist --remote && wrangler deploy",
    "db:migrate:local": "wrangler d1 migrations apply fakka-waitlist --local",
    "db:migrate:remote": "wrangler d1 migrations apply fakka-waitlist --remote",
```

Create `.dev.vars.example`:

```
# Copy to .dev.vars for `pnpm preview` (wrangler dev). Never commit .dev.vars.
# Cloudflare's always-pass Turnstile test secret:
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# Leave empty to skip sending emails locally, or use a Resend test key.
RESEND_API_KEY=
```

Append to `.gitignore` under `# cloudflare`:

```
.dev.vars
```

- [ ] **Step 6: Check the config parses**

Run: `pnpm exec wrangler deploy --dry-run --outdir /tmp/fakka-dry`
Expected: Wrangler bundles `worker/index.ts` and lists the `DB`, `WAITLIST_LIMITER`, and vars bindings without errors (it may warn that `./out` is missing if `pnpm build` hasn't run — run `pnpm build` first if it errors on that).

- [ ] **Step 7: Commit**

```bash
git add worker/ wrangler.jsonc package.json .gitignore .dev.vars.example
git commit -m "feat(worker): serve POST /api/waitlist with rate limit, Turnstile and D1"
```

---

### Task 5: Front end — Turnstile token, error notices, new mode rule

**Files:**
- Create: `src/lib/turnstile.ts`, `src/components/landing/TurnstileWidget.tsx`
- Modify: `src/lib/waitlist.ts`, `src/components/landing/WaitlistForm.tsx`, `messages/en.json`, `messages/ar.json`
- Test: `src/lib/waitlist.test.ts`, `src/components/landing/WaitlistForm.test.tsx`

**Interfaces:**
- Consumes: the HTTP contract from Task 4 (200 `{position, inviteUrl}`, 403, 429, others).
- Produces:
  - `WaitlistInput` gains `turnstileToken: string | null`.
  - `WaitlistMode` remote variant becomes `{ kind: "remote"; endpoint: string; turnstileSiteKey: string }`.
  - `getWaitlistMode(env?: { endpoint: string | undefined; siteKey: string | undefined; nodeEnv: string | undefined })`.
  - `class WaitlistError extends Error { reason: WaitlistErrorReason }`, `type WaitlistErrorReason = "rate_limited" | "verification" | "failed"`.
  - `loadTurnstile(): Promise<TurnstileApi>`; `TurnstileWidget` props `{ siteKey: string; locale: Locale; onToken(token: string | null): void; ref?: Ref<TurnstileHandle> }`, `TurnstileHandle = { reset(): void }`.

- [ ] **Step 1: Add the new strings**

In `messages/en.json` → `Waitlist.errors`, add:

```json
      "verify": "One moment, we’re checking you’re not a bot. Try again in a few seconds.",
      "tooMany": "Too many tries. Wait a minute, then try again."
```

In `messages/ar.json` → `Waitlist.errors`, add:

```json
      "verify": "ثانية واحدة، بنتأكد إنك مش روبوت. جرّب تاني كمان شوية.",
      "tooMany": "محاولات كتير. استنّى دقيقة وجرّب تاني."
```

- [ ] **Step 2: Update `src/lib/waitlist.test.ts` (failing first)**

Make these edits:

1. Change `input` and `remote`:

```ts
const input: WaitlistInput = {
  name: "Mona",
  email: "mona@example.com",
  locale: "ar",
  ref: "friend42",
  turnstileToken: "tok",
};
const remote: WaitlistMode = {
  kind: "remote",
  endpoint: "https://api.example.com/waitlist",
  turnstileSiteKey: "site-key",
};
```

2. Add `WaitlistError` to the import list from `./waitlist`.

3. Replace the `getWaitlistMode` describe block with:

```ts
describe("getWaitlistMode", () => {
  it("uses the endpoint when it and the Turnstile site key are configured", () => {
    expect(getWaitlistMode({ endpoint: "/api/waitlist", siteKey: "sk", nodeEnv: "production" })).toEqual({
      kind: "remote",
      endpoint: "/api/waitlist",
      turnstileSiteKey: "sk",
    });
  });

  it("is unavailable when the endpoint has no Turnstile site key", () => {
    expect(getWaitlistMode({ endpoint: "/api/waitlist", siteKey: undefined, nodeEnv: "production" })).toEqual({
      kind: "unavailable",
    });
    expect(getWaitlistMode({ endpoint: "/api/waitlist", siteKey: "", nodeEnv: "development" })).toEqual({
      kind: "unavailable",
    });
  });

  it("falls back to the stub in development", () => {
    expect(getWaitlistMode({ endpoint: undefined, siteKey: undefined, nodeEnv: "development" })).toEqual({
      kind: "stub",
    });
  });

  it("is unavailable in production without an endpoint", () => {
    expect(getWaitlistMode({ endpoint: undefined, siteKey: "sk", nodeEnv: "production" })).toEqual({
      kind: "unavailable",
    });
  });

  it("treats an empty endpoint as missing", () => {
    expect(getWaitlistMode({ endpoint: "", siteKey: "sk", nodeEnv: "production" })).toEqual({
      kind: "unavailable",
    });
  });
});
```

4. In `describe("submitWaitlist")`, replace "rejects on a non-2xx response" with:

```ts
  it.each([
    [429, "rate_limited"],
    [403, "verification"],
    [400, "failed"],
    [500, "failed"],
  ])("rejects a %i response with reason %s", async (status, reason) => {
    stubFetch(json({ error: "x" }, status));
    const error = await submitWaitlist(input, remote).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WaitlistError);
    expect((error as WaitlistError).reason).toBe(reason);
  });
```

(The existing "POSTs the input as JSON" test already compares the body to `input`, which now includes `turnstileToken`.)

Run: `pnpm vitest run src/lib/waitlist.test.ts`
Expected: FAIL (type/behaviour mismatches: no `WaitlistError`, mode shape).

- [ ] **Step 3: Update `src/lib/waitlist.ts`**

Replace the types and `getWaitlistMode`/`submitWaitlist` with:

```ts
export type WaitlistInput = {
  name: string;
  email: string;
  locale: Locale;
  ref: string | null;
  // Cloudflare Turnstile token; null only in stub mode.
  turnstileToken: string | null;
};

export type WaitlistResult = { position: number; inviteUrl: string };

export type WaitlistMode =
  | { kind: "remote"; endpoint: string; turnstileSiteKey: string }
  | { kind: "stub" }
  | { kind: "unavailable" };

export type WaitlistErrorReason = "rate_limited" | "verification" | "failed";

export class WaitlistError extends Error {
  reason: WaitlistErrorReason;
  constructor(reason: WaitlistErrorReason, message: string) {
    super(message);
    this.name = "WaitlistError";
    this.reason = reason;
  }
}

const STUB_DELAY_MS = 600;

// process.env.NEXT_PUBLIC_* must be read literally so Next can inline it at build time.
export function getWaitlistMode(
  env: { endpoint: string | undefined; siteKey: string | undefined; nodeEnv: string | undefined } = {
    endpoint: process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    nodeEnv: process.env.NODE_ENV,
  },
): WaitlistMode {
  if (env.endpoint) {
    // The backend refuses every request without a Turnstile token.
    return env.siteKey
      ? { kind: "remote", endpoint: env.endpoint, turnstileSiteKey: env.siteKey }
      : { kind: "unavailable" };
  }
  // Never show made-up queue numbers to real visitors.
  return env.nodeEnv === "development" ? { kind: "stub" } : { kind: "unavailable" };
}
```

and in `submitWaitlist`:

```ts
export async function submitWaitlist(input: WaitlistInput, mode: WaitlistMode): Promise<WaitlistResult> {
  if (mode.kind === "unavailable") throw new WaitlistError("failed", "Waitlist is not available");
  if (mode.kind === "stub") return submitToStub(input);

  const response = await fetch(mode.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const reason: WaitlistErrorReason =
      response.status === 429 ? "rate_limited" : response.status === 403 ? "verification" : "failed";
    throw new WaitlistError(reason, `Waitlist request failed: ${response.status}`);
  }
  return parseWaitlistResponse(await response.json());
}
```

Run: `pnpm vitest run src/lib/waitlist.test.ts` — Expected: PASS.

- [ ] **Step 4: Turnstile loader and widget**

`src/lib/turnstile.ts`:

```ts
export type TurnstileRenderOptions = {
  sitekey: string;
  action?: string;
  language?: string;
  theme?: "auto" | "light" | "dark";
  appearance?: "always" | "execute" | "interaction-only";
  "response-field"?: boolean;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

export type TurnstileApi = {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

// Loads Cloudflare's script once per page.
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not initialise"));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
```

`src/components/landing/TurnstileWidget.tsx`:

```tsx
"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Locale } from "@/i18n/routing";
import { loadTurnstile } from "@/lib/turnstile";

export type TurnstileHandle = { reset(): void };

type Props = {
  siteKey: string;
  locale: Locale;
  onToken(token: string | null): void;
  ref?: Ref<TurnstileHandle>;
};

// Cloudflare's bot check. Usually invisible; it only shows a box when it
// needs the visitor to click.
export function TurnstileWidget({ siteKey, locale, onToken, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useImperativeHandle(
    ref,
    () => ({
      // Tokens are single-use: get a fresh one after every attempt.
      reset() {
        onTokenRef.current(null);
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId.current =
          turnstile.render(container.current, {
            sitekey: siteKey,
            action: "waitlist",
            language: locale,
            theme: "auto",
            appearance: "interaction-only",
            "response-field": false,
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
          }) ?? null;
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, locale]);

  return <div ref={container} className="mt-3 empty:mt-0" />;
}
```

- [ ] **Step 5: Update `WaitlistForm.test.tsx` (failing first)**

Edits:

1. Change `remote`:

```ts
const remote: WaitlistMode = {
  kind: "remote",
  endpoint: "https://api.example.com/waitlist",
  turnstileSiteKey: "site-key",
};
```

2. Add a Turnstile stub after `stubFetch`:

```ts
// Stands in for Cloudflare's script: hands out tokens in order.
function stubTurnstile({ autoSolve = true } = {}) {
  let issued = 0;
  let callback: ((token: string) => void) | undefined;
  const api = {
    render: vi.fn((_el: HTMLElement, options: { callback?: (token: string) => void }) => {
      callback = options.callback;
      if (autoSolve) callback?.(`token-${++issued}`);
      return "widget-1";
    }),
    reset: vi.fn(() => {
      if (autoSolve) callback?.(`token-${++issued}`);
    }),
    remove: vi.fn(),
  };
  vi.stubGlobal("turnstile", api);
  return api;
}
```

3. In `beforeEach`, add `stubTurnstile();` (tests that need a different stub call it again; the later stub wins).

4. In "sends the trimmed name, email, locale and the ref from the URL", change the expected body to include the token:

```ts
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Mona",
      email: "mona@example.com",
      locale: "en",
      ref: "friend42",
      turnstileToken: "token-1",
    });
```

5. Add these tests inside `describe("WaitlistForm")`:

```ts
  it("renders the bot check in the page language", async () => {
    const turnstile = stubTurnstile();
    renderForm({ locale: "ar" });
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    expect(turnstile.render.mock.calls[0][1]).toMatchObject({ sitekey: "site-key", language: "ar", action: "waitlist" });
  });

  it("waits for the bot check instead of sending without a token", async () => {
    stubTurnstile({ autoSolve: false });
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user);

    expect(fetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "One moment, we’re checking you’re not a bot. Try again in a few seconds.",
    );
  });

  it("gets a fresh token and explains when the bot check fails on the server", async () => {
    const turnstile = stubTurnstile();
    const fetch = stubFetch(() => Promise.resolve(new Response("{}", { status: 403 })));
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("checking you’re not a bot");
    expect(turnstile.reset).toHaveBeenCalledTimes(1);

    fetch.mockImplementation(joined);
    await user.click(screen.getByRole("button", { name: "Join" }));
    await screen.findByRole("status");
    const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).turnstileToken).toBe("token-2");
  });

  it("asks to wait after too many tries", async () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 429 })));
    const user = userEvent.setup();
    renderForm({ locale: "ar" });

    await user.type(screen.getByLabelText("اسمك"), "منى");
    await user.type(screen.getByLabelText("إيميلك"), "mona@example.com");
    await user.click(screen.getByRole("button", { name: "سجّلني" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("محاولات كتير. استنّى دقيقة وجرّب تاني.");
  });

  it("does not load the bot check in stub mode", () => {
    const turnstile = stubTurnstile();
    renderForm({ mode: { kind: "stub" } });
    expect(turnstile.render).not.toHaveBeenCalled();
  });
```

Run: `pnpm vitest run src/components/landing/WaitlistForm.test.tsx`
Expected: FAIL (no token in body, no widget, no new notices).

- [ ] **Step 6: Update `WaitlistForm.tsx`**

1. Imports: add `TurnstileWidget, type TurnstileHandle` from `./TurnstileWidget`, and `WaitlistError` from `@/lib/waitlist`.
2. Status type:

```ts
type ErrorReason = "failed" | "rate_limited" | "verification";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; reason: ErrorReason }
  | { kind: "success"; result: WaitlistResult };
```

3. Inside the component, after `inFlight`:

```ts
  const [token, setToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
```

4. In `handleSubmit`, after the honeypot check and before `inFlight.current = true`:

```ts
    if (mode.kind === "remote" && !token) {
      setStatus({ kind: "error", reason: "verification" });
      return;
    }
```

pass `turnstileToken: token` in the `submitWaitlist` input, and replace the `catch` with:

```ts
    } catch (error) {
      setStatus({ kind: "error", reason: error instanceof WaitlistError ? error.reason : "failed" });
      // The token was spent on this attempt.
      if (mode.kind === "remote") turnstile.current?.reset();
    } finally {
```

5. After the closing `</fieldset>`, add:

```tsx
      {mode.kind === "remote" && (
        <TurnstileWidget ref={turnstile} siteKey={mode.turnstileSiteKey} locale={locale} onToken={setToken} />
      )}
```

6. Replace the error paragraph:

```tsx
      {status.kind === "error" && (
        <p role="alert" className="mt-4 text-sm text-gold">
          {status.reason === "verification"
            ? t("errors.verify")
            : status.reason === "rate_limited"
              ? t("errors.tooMany")
              : t("error")}
        </p>
      )}
```

- [ ] **Step 7: Run all tests, lint, and build**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: all tests PASS, lint clean, build succeeds (the form renders as unavailable because no env vars are set — correct).

- [ ] **Step 8: Commit**

```bash
git add src/ messages/
git commit -m "feat: send a Turnstile token with waitlist signups and explain refusals"
```

---

### Task 6: Docs and local end-to-end check

**Files:**
- Modify: `AGENTS.md`, `README.md`

**Interfaces:**
- Consumes: scripts and config from Task 4, env vars from Task 5.

- [ ] **Step 1: Update `AGENTS.md`**

In **Commands**, replace the preview/deploy lines and add migration and env notes:

```markdown
- Preview on the Workers runtime: `pnpm preview` (build + local D1 migrations + `wrangler dev`).
  Copy `.dev.vars.example` to `.dev.vars` first.
- Deploy: `pnpm deploy` (build + remote D1 migrations + `wrangler deploy`)
- D1 migrations alone: `pnpm db:migrate:local` / `pnpm db:migrate:remote` (SQL in `migrations/`)
```

and add to the Test line: "Worker tests (`worker/*.test.ts`) run in the node environment against in-memory SQLite (`worker/test/sqlite-d1.ts`)."

Replace the **Fully static** and **Waitlist endpoint** bullets with:

```markdown
- **Static site plus one API Worker.** `next.config.ts` sets `output: "export"`,
  `trailingSlash: true`, and unoptimized images, so Next has no server at
  runtime: no middleware, route handlers, server actions, or `next/image`
  optimization. Cloudflare serves `./out` as static assets; `wrangler.jsonc`
  also runs `worker/index.ts` for `/api/*` only (`assets.run_worker_first`).
- **Waitlist backend (`worker/`).** `POST /api/waitlist` takes
  `{ name, email, locale, ref, turnstileToken }` and returns
  `200 { position, inviteUrl }` (400/403/429/500 with `{ error }`). Order:
  per-IP rate limit (`WAITLIST_LIMITER`), validation, Turnstile siteverify,
  then D1 (`DB`, table `signups`). Same email (normalized by
  `worker/email-key.ts`) returns the existing place. Score = join order −
  `REFERRAL_JUMP` × referrals, earlier join wins ties. The Resend confirmation
  email is sent in `ctx.waitUntil` and never fails a signup; its copy is the
  `Email` namespace in `messages/*.json`. Vars live in `wrangler.jsonc`;
  secrets are `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY`. Store only what
  the brief's Privacy section allows. Binding types are hand-written in
  `worker/env.ts` (the root tsconfig uses the DOM lib).
- **Waitlist form.** Posts to `NEXT_PUBLIC_WAITLIST_ENDPOINT` (`/api/waitlist`)
  with a token from the Turnstile widget (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`);
  both are inlined at build time (`src/lib/waitlist.ts`). Without the endpoint,
  `pnpm dev` uses a local stub; production builds missing either value show
  the form as disabled ("Sign-ups open very soon"). Invite links carry
  `?ref=`; the root `/` redirect keeps the query string.
```

- [ ] **Step 2: Add a "Waitlist backend" section to `README.md`**

Append:

```markdown
## Waitlist backend

The waitlist API is a Cloudflare Worker (`worker/`) deployed with the static
site. It stores signups in D1, checks visitors with Turnstile and a per-IP rate
limit, and emails each new signup through Resend.

### Local

1. `cp .dev.vars.example .dev.vars` (uses Turnstile's always-pass test secret).
2. Build with the endpoint and Turnstile's always-pass test site key:
   `NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm preview`

### Production setup (once)

1. `pnpm exec wrangler d1 create fakka-waitlist` and add the printed
   `database_id` to the `d1_databases` entry in `wrangler.jsonc`.
2. Create a Turnstile widget for `fakka.com`; then
   `pnpm exec wrangler secret put TURNSTILE_SECRET_KEY`.
3. Verify `fakka.com` in Resend, create an API key, then
   `pnpm exec wrangler secret put RESEND_API_KEY`. The sender is `EMAIL_FROM`
   in `wrangler.jsonc`.
4. Build and deploy with
   `NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key> pnpm deploy`.
5. Attach `fakka.com` to the `fakka` Worker as a custom domain.

Change how far each referral moves someone with the `REFERRAL_JUMP` var.
```

- [ ] **Step 3: Local end-to-end smoke check**

```bash
cp .dev.vars.example .dev.vars
NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm build
pnpm db:migrate:local
pnpm exec wrangler dev --port 8787 &   # stop it afterwards
curl -s -X POST localhost:8787/api/waitlist -H 'Content-Type: application/json' \
  -d '{"name":"Mona","email":"mona@example.com","locale":"ar","ref":null,"turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'
curl -s -X POST localhost:8787/api/waitlist -H 'Content-Type: application/json' \
  -d '{"name":"Mona","email":"MONA+x@example.com","locale":"en","ref":null,"turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/en/
```

Expected: first call `{"position":1,"inviteUrl":"https://fakka.com/ar/?ref=…"}`; second call returns the same body; `/en/` returns 200. Then stop `wrangler dev` and delete `.dev.vars` and `.wrangler/` state if desired (both are gitignored). If siteverify can't be reached from this machine, record that and rely on the unit tests.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: document the waitlist Worker, its config and setup"
```
