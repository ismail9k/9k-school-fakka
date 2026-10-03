# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder home page with the bilingual Fakka launch page (header, hero, features, waitlist form, FAQ, "what happens next", footer) as a static export.

**Architecture:** Every section is a small server component in `src/components/landing/` reading its own next-intl namespace. The waitlist form is the only client component. It submits through `src/lib/waitlist.ts`, which picks between a real endpoint (`NEXT_PUBLIC_WAITLIST_ENDPOINT`), a development stub, or an "unavailable" state. Colours and fonts are Tailwind v4 theme tokens in `globals.css`. Arabic font switching is done with `:lang(ar)` CSS variables, so components never branch on locale for styling.

**Tech Stack:** Next.js 16.3 (static export), React 19.2, next-intl 4, Tailwind CSS 4, `next/font` (Google + local), Vitest 5 + Testing Library + jsdom, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-03-landing-page-design.md`

## Global Constraints

- Static export only (`output: "export"`): no middleware, route handlers, server actions, or runtime server code.
- Every page under `src/app/[locale]/` calls `setRequestLocale(locale)`.
- Every user-facing string goes in **both** `messages/en.json` and `messages/ar.json`, written naturally for each language (Egyptian Arabic, not word-for-word).
- Never promise a launch date, a price, or a feature that is not in `docs/faka-product-brief.md`.
- Use logical Tailwind utilities only (`ms-`, `pe-`, `start-`, `text-start`). Never `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right`.
- Emphasis uses the `font-heading` utility. Never use `font-medium`, `font-semibold` or `font-bold` on text that can be Arabic: Thmanyah Sans only ships Regular, and the browser would fake a bold.
- Colours come only from the tokens: `paper #F7F2E9`, `ink #1F1A15`, `ink-soft #5E554B`, `line #E0D4BF`, `green #166434`, `green-deep #0F4A26`, `green-tint #E3EEE5`, `gold #E9B866`. `gold` appears only on the green form band.
- Email inputs and invite links are always `dir="ltr"`.
- Internal links use trailing-slash locale paths (`/en/`, `/ar/`).
- English copy uses typographic apostrophes (’) so ICU message syntax never treats `'` as an escape.
- Commit after every task; end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Invite links that point at the bare domain** (`https://fakka.app/?ref=abc`): the root `/` page redirects to `/en/` or `/ar/` in the browser and currently drops the query string, so the friend who invited is never credited. Task 6 fixes the redirect and verifies it by hand.
2. **A name made only of spaces** passes `required` and would reach the backend as `""`. The name input gets `pattern=".*\S.*"` and the "Please enter your name." message. Task 3 has a test for it.
3. **Double submission** (double click, or Enter pressed twice on a slow network) must send exactly one request. Task 3 has a test for it.
4. **A 200 response with a malformed body** (missing or non-numeric `position`, empty `inviteUrl`, non-JSON) must show the generic error, never "You’re #undefined". Task 1 has tests for it.
5. **Arabic visitors seeing English browser validation messages.** Validation messages are set with `setCustomValidity` from the page's messages. Task 3 has a test for it in Arabic.

---

### Task 1: Test tooling and waitlist client library

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Create: `vitest.config.mts`
- Create: `vitest.setup.ts`
- Create: `src/lib/waitlist.ts`
- Test: `src/lib/waitlist.test.ts`
- Modify: `AGENTS.md` (Commands section)

**Interfaces:**
- Consumes: `Locale` from `src/i18n/routing.ts` (`"en" | "ar"`).
- Produces (used by Task 3):
  ```ts
  export type WaitlistInput = { name: string; email: string; locale: Locale; ref: string | null };
  export type WaitlistResult = { position: number; inviteUrl: string };
  export type WaitlistMode =
    | { kind: "remote"; endpoint: string }
    | { kind: "stub" }
    | { kind: "unavailable" };
  export function getWaitlistMode(env?: { endpoint: string | undefined; nodeEnv: string | undefined }): WaitlistMode;
  export function readRef(search: string): string | null;
  export function parseWaitlistResponse(body: unknown): WaitlistResult; // throws on malformed
  export function submitWaitlist(input: WaitlistInput, mode: WaitlistMode): Promise<WaitlistResult>; // rejects on any failure
  ```

- [ ] **Step 1: Install test dependencies**

Run:
```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom
```
Expected: install succeeds. If pnpm reports ignored build scripts for a new package, do **not** edit `pnpm-workspace.yaml`. Stop and report which package asked.

- [ ] **Step 2: Add the test scripts**

In `package.json` `"scripts"`, add after `"lint": "eslint"`:
```json
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.mts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: Write the failing tests**

Create `src/lib/waitlist.test.ts`:
```ts
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
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test src/lib/waitlist.test.ts`
Expected: FAIL with an import error: `Failed to resolve import "./waitlist"` (or similar).

- [ ] **Step 7: Implement `src/lib/waitlist.ts`**

```ts
import type { Locale } from "@/i18n/routing";

export type WaitlistInput = {
  name: string;
  email: string;
  locale: Locale;
  ref: string | null;
};

export type WaitlistResult = { position: number; inviteUrl: string };

export type WaitlistMode =
  | { kind: "remote"; endpoint: string }
  | { kind: "stub" }
  | { kind: "unavailable" };

const STUB_DELAY_MS = 600;

// process.env.NEXT_PUBLIC_* must be read literally so Next can inline it at build time.
export function getWaitlistMode(
  env: { endpoint: string | undefined; nodeEnv: string | undefined } = {
    endpoint: process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT,
    nodeEnv: process.env.NODE_ENV,
  },
): WaitlistMode {
  if (env.endpoint) return { kind: "remote", endpoint: env.endpoint };
  // Never show made-up queue numbers to real visitors.
  return env.nodeEnv === "development" ? { kind: "stub" } : { kind: "unavailable" };
}

export function readRef(search: string): string | null {
  const ref = new URLSearchParams(search).get("ref")?.trim();
  return ref ? ref : null;
}

export function parseWaitlistResponse(body: unknown): WaitlistResult {
  if (typeof body === "object" && body !== null) {
    const { position, inviteUrl } = body as Record<string, unknown>;
    if (
      typeof position === "number" &&
      Number.isInteger(position) &&
      position > 0 &&
      typeof inviteUrl === "string" &&
      inviteUrl !== ""
    ) {
      return { position, inviteUrl };
    }
  }
  throw new Error("Malformed waitlist response");
}

export async function submitWaitlist(input: WaitlistInput, mode: WaitlistMode): Promise<WaitlistResult> {
  if (mode.kind === "unavailable") throw new Error("Waitlist is not available");
  if (mode.kind === "stub") return submitToStub(input);

  const response = await fetch(mode.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Waitlist request failed: ${response.status}`);
  return parseWaitlistResponse(await response.json());
}

function submitToStub({ locale }: WaitlistInput): Promise<WaitlistResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        position: 1 + Math.floor(Math.random() * 5000),
        inviteUrl: `https://example.com/${locale}/?ref=demo123`,
      });
    }, STUB_DELAY_MS);
  });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test src/lib/waitlist.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 9: Document the command**

In `AGENTS.md`, replace the line `- Test: no test runner is set up yet.` with:
```markdown
- Test: `pnpm test` (Vitest + Testing Library, jsdom). Watch mode: `pnpm test:watch`.
  Tests sit next to the code they cover (`*.test.ts(x)`).
```

- [ ] **Step 10: Lint and commit**

Run: `pnpm lint`
Expected: no errors.

```bash
git add package.json pnpm-lock.yaml vitest.config.mts vitest.setup.ts src/lib/waitlist.ts src/lib/waitlist.test.ts AGENTS.md
git commit -m "feat: add waitlist client library with Vitest setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens and fonts

**Files:**
- Create: `src/fonts/thmanyah/thmanyahsans-Regular.woff2` (copied)
- Create: `src/fonts/thmanyah/thmanyahserifdisplay-Bold.woff2` (copied)
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/globals.css` (full rewrite)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 3–5):
  - Colour utilities: `bg-/text-/border-` × `paper`, `ink`, `ink-soft`, `line`, `green`, `green-deep`, `green-tint`, `gold` (opacity modifiers like `text-paper/80` work).
  - `font-heading`: heading/emphasis face (IBM Plex Sans 600 in English, Thmanyah Serif Display 700 in Arabic). Sets both family and weight.
  - `font-wordmark`: always Thmanyah Serif Display 700 (for "فكّة").
  - `.coin`: decorative coin disc (background + shadow only; size/position set by utilities).
  - Body text automatically uses Plex (English) or Thmanyah Sans (Arabic) via `lang`, including inline elements with their own `lang` attribute.

- [ ] **Step 1: Copy the font files**

```bash
mkdir -p src/fonts/thmanyah
cp /Users/ismail9k/ismail9k/ismail9k.com/public/fonts/thmanyah/sans/thmanyahsans-Regular.woff2 src/fonts/thmanyah/
cp /Users/ismail9k/ismail9k/ismail9k.com/public/fonts/thmanyah/serifdisplay/thmanyahserifdisplay-Bold.woff2 src/fonts/thmanyah/
ls src/fonts/thmanyah
```
Expected: both `.woff2` files listed.

- [ ] **Step 2: Replace the fonts in `src/app/[locale]/layout.tsx`**

Replace the import line and the two font constants:
```tsx
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
```
```tsx
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
});
```
with:
```tsx
import { IBM_Plex_Sans } from "next/font/google";
import localFont from "next/font/local";
```
```tsx
const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Only Regular exists for Thmanyah Sans; Arabic emphasis uses Serif Display.
const thmanyahSans = localFont({
  src: "../../fonts/thmanyah/thmanyahsans-Regular.woff2",
  weight: "400",
  variable: "--font-thmanyah-sans",
});

const thmanyahSerif = localFont({
  src: "../../fonts/thmanyah/thmanyahserifdisplay-Bold.woff2",
  weight: "700",
  variable: "--font-thmanyah-serif",
});
```

Then replace the `<html>`/`<body>` block:
```tsx
    <html
      lang={locale}
      dir={rtlLocales.includes(locale) ? "rtl" : "ltr"}
      className={`${inter.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
```
with:
```tsx
    <html
      lang={locale}
      dir={rtlLocales.includes(locale) ? "rtl" : "ltr"}
      className={`${plex.variable} ${thmanyahSans.variable} ${thmanyahSerif.variable} h-full antialiased motion-safe:scroll-smooth`}
    >
      <body className="flex min-h-full flex-col">
```

- [ ] **Step 3: Rewrite `src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-paper: #f7f2e9;
  --color-ink: #1f1a15;
  --color-ink-soft: #5e554b;
  --color-line: #e0d4bf;
  --color-green: #166434;
  --color-green-deep: #0f4a26;
  --color-green-tint: #e3eee5;
  --color-gold: #e9b866;

  --font-sans: var(--font-plex), ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  /* Fonts follow the language of each element, so an Arabic link on the
     English page (and vice versa) gets the right face. */
  :lang(en) {
    --font-sans: var(--font-plex), ui-sans-serif, system-ui, sans-serif;
    --heading-family: var(--font-plex), ui-sans-serif, system-ui, sans-serif;
    --heading-weight: 600;
  }

  :lang(ar) {
    --font-sans: var(--font-thmanyah-sans), ui-sans-serif, sans-serif;
    --heading-family: var(--font-thmanyah-serif), serif;
    --heading-weight: 700;
  }

  [lang] {
    font-family: var(--font-sans);
  }

  body {
    background: var(--color-paper);
    color: var(--color-ink);
  }
}

@layer components {
  .coin {
    border-radius: 9999px;
    background: radial-gradient(circle at 35% 30%, #3e9a62, var(--color-green) 55%, var(--color-green-deep));
    box-shadow:
      inset 0 0 0 6px rgb(255 255 255 / 0.13),
      0 10px 24px rgb(22 100 52 / 0.27);
  }
}

@utility font-heading {
  font-family: var(--heading-family);
  font-weight: var(--heading-weight);
}

@utility font-wordmark {
  font-family: var(--font-thmanyah-serif), serif;
  font-weight: 700;
}
```

- [ ] **Step 4: Build to verify**

Run: `pnpm build`
Expected: build succeeds, and `out/en/index.html` and `out/ar/index.html` exist. The current placeholder page now renders on the paper background.

Run: `ls out/_next/static/media | grep -c woff2`
Expected: a count ≥ 3 (Plex plus the two Thmanyah files).

- [ ] **Step 5: Lint and commit**

Run: `pnpm lint`
Expected: no errors.

```bash
git add src/fonts src/app/globals.css "src/app/[locale]/layout.tsx"
git commit -m "feat: add Fakka colour tokens and Thmanyah/Plex fonts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Waitlist form

**Files:**
- Create: `src/components/landing/WaitlistForm.tsx`
- Test: `src/components/landing/WaitlistForm.test.tsx`
- Modify: `messages/en.json`, `messages/ar.json` (add `Waitlist` namespace)

**Interfaces:**
- Consumes: `getWaitlistMode`, `readRef`, `submitWaitlist`, `WaitlistMode`, `WaitlistResult` from `@/lib/waitlist` (Task 1); `Locale` from `@/i18n/routing`; tokens and `font-heading` from Task 2.
- Produces (used by Task 4): `export function WaitlistForm({ mode }: { mode?: WaitlistMode }): JSX.Element`, a client component. `mode` defaults to `getWaitlistMode()`. It renders the form, or the success panel after joining. It does **not** render the section wrapper or the heading. The `Waitlist` namespace keys `kicker`, `title` and `body` are used by Task 4's `Join` section.

- [ ] **Step 1: Add the `Waitlist` messages**

In `messages/en.json`, add this top-level key (keep `Metadata` and `Home` as they are):
```json
  "Waitlist": {
    "kicker": "Get early access",
    "title": "Save your spot.",
    "body": "Join the list and we’ll invite you first.",
    "nameLabel": "Your name",
    "namePlaceholder": "Mona",
    "emailLabel": "Email",
    "emailPlaceholder": "you@email.com",
    "submit": "Join",
    "submitting": "Joining…",
    "privacy": "We only email you about Fakka’s launch. We never share your details.",
    "unavailable": "Sign-ups open very soon.",
    "error": "Something went wrong. Please try again.",
    "honeypot": "Leave this field empty",
    "errors": {
      "nameMissing": "Please enter your name.",
      "emailMissing": "Please enter your email.",
      "emailInvalid": "Please enter a valid email."
    },
    "success": {
      "position": "You’re <num>#{position}</num>",
      "body": "Each friend who joins with your link moves you up the queue.",
      "linkLabel": "Your invite link",
      "copy": "Copy",
      "copied": "Copied"
    }
  }
```

In `messages/ar.json`, add:
```json
  "Waitlist": {
    "kicker": "ادخل بدري",
    "title": "احجز مكانك.",
    "body": "سجّل، وهنبعتلك الدعوة قبل أي حد.",
    "nameLabel": "اسمك",
    "namePlaceholder": "منى",
    "emailLabel": "إيميلك",
    "emailPlaceholder": "you@email.com",
    "submit": "سجّلني",
    "submitting": "ثانية واحدة…",
    "privacy": "مش هنبعتلك غير عن إطلاق فكّة، ومش هنشارك بياناتك مع حد.",
    "unavailable": "التسجيل هيفتح قريب جدًا.",
    "error": "حصلت مشكلة. جرّب تاني.",
    "honeypot": "سيب الخانة دي فاضية",
    "errors": {
      "nameMissing": "اكتب اسمك.",
      "emailMissing": "اكتب إيميلك.",
      "emailInvalid": "الإيميل ده مش مظبوط."
    },
    "success": {
      "position": "إنت رقم <num>{position}</num> في الدور",
      "body": "كل صاحب يسجّل من اللينك بتاعك بيقدّمك في الدور.",
      "linkLabel": "لينك الدعوة بتاعك",
      "copy": "انسخ",
      "copied": "اتنسخ"
    }
  }
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/landing/WaitlistForm.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import type { WaitlistMode } from "@/lib/waitlist";
import { WaitlistForm } from "./WaitlistForm";

const remote: WaitlistMode = { kind: "remote", endpoint: "https://api.example.com/waitlist" };
const INVITE = "https://fakka.app/en/?ref=abc123";

function renderForm({ locale = "en", mode = remote }: { locale?: "en" | "ar"; mode?: WaitlistMode } = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <WaitlistForm mode={mode} />
    </NextIntlClientProvider>,
  );
}

function stubFetch(impl: () => Promise<Response>) {
  const fetch = vi.fn(impl);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const joined = () =>
  Promise.resolve(new Response(JSON.stringify({ position: 1234, inviteUrl: INVITE }), { status: 200 }));

async function fillAndSubmit(user: UserEvent, name = "Mona", email = "mona@example.com") {
  await user.type(screen.getByLabelText("Your name"), name);
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Join" }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/en/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WaitlistForm", () => {
  it("shows the queue position and invite link after joining", async () => {
    stubFetch(joined);
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user);

    expect(await screen.findByRole("status")).toHaveTextContent("You’re #1,234");
    expect(screen.getByLabelText("Your invite link")).toHaveValue(INVITE);
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
  });

  it("sends the trimmed name, email, locale and the ref from the URL", async () => {
    window.history.replaceState({}, "", "/en/?ref=friend42");
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user, "  Mona  ");
    await screen.findByRole("status");

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Mona",
      email: "mona@example.com",
      locale: "en",
      ref: "friend42",
    });
  });

  it("sends ref as null when the URL has none", async () => {
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user);
    await screen.findByRole("status");

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).ref).toBeNull();
  });

  it("shows a joining state and sends only one request on repeated clicks", async () => {
    const fetch = stubFetch(() => new Promise<Response>(() => {}));
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user);
    const button = screen.getByRole("button", { name: "Joining…" });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error and keeps the form usable when the server fails", async () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 500 })));
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.getByRole("button", { name: "Join" })).toBeEnabled();
    expect(screen.getByLabelText("Your name")).toHaveValue("Mona");
  });

  it("shows an error when the network fails", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("does not send anything when the hidden bot field is filled", async () => {
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    const { container } = renderForm();

    await user.type(container.querySelector<HTMLInputElement>('input[name="website"]')!, "spam");
    await fillAndSubmit(user);

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Join" })).toBeEnabled();
  });

  it("rejects a name made only of spaces", async () => {
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user, "   ");

    expect(fetch).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Your name") as HTMLInputElement).validationMessage).toBe(
      "Please enter your name.",
    );
  });

  it("rejects an invalid email with a friendly message", async () => {
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    renderForm();

    await fillAndSubmit(user, "Mona", "not-an-email");

    expect(fetch).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Email") as HTMLInputElement).validationMessage).toBe(
      "Please enter a valid email.",
    );
  });

  it("uses Arabic validation messages on the Arabic page", async () => {
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    renderForm({ locale: "ar" });

    await user.click(screen.getByRole("button", { name: "سجّلني" }));

    expect(fetch).not.toHaveBeenCalled();
    expect((screen.getByLabelText("اسمك") as HTMLInputElement).validationMessage).toBe("اكتب اسمك.");
    expect((screen.getByLabelText("إيميلك") as HTMLInputElement).validationMessage).toBe("اكتب إيميلك.");
  });

  it("shows the position in Arabic digits on the Arabic page", async () => {
    stubFetch(joined);
    const user = userEvent.setup();
    renderForm({ locale: "ar" });

    await user.type(screen.getByLabelText("اسمك"), "منى");
    await user.type(screen.getByLabelText("إيميلك"), "mona@example.com");
    await user.click(screen.getByRole("button", { name: "سجّلني" }));

    expect(await screen.findByRole("status")).toHaveTextContent("إنت رقم ١٬٢٣٤ في الدور");
  });

  it("is disabled with a notice when sign-ups are unavailable", async () => {
    const fetch = stubFetch(joined);
    renderForm({ mode: { kind: "unavailable" } });

    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
    expect(screen.getByLabelText("Your name")).toBeDisabled();
    expect(screen.getByText("Sign-ups open very soon.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("copies the invite link", async () => {
    stubFetch(joined);
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user);
    await screen.findByRole("status");

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(await navigator.clipboard.readText()).toBe(INVITE);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("selects the invite link when copying is not allowed", async () => {
    stubFetch(joined);
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user);
    await screen.findByRole("status");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await user.click(screen.getByRole("button", { name: "Copy" }));

    const link = screen.getByLabelText("Your invite link") as HTMLInputElement;
    expect(link.selectionStart).toBe(0);
    expect(link.selectionEnd).toBe(INVITE.length);
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test src/components/landing/WaitlistForm.test.tsx`
Expected: FAIL with `Failed to resolve import "./WaitlistForm"`.

- [ ] **Step 4: Implement `src/components/landing/WaitlistForm.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent, type FormEventHandler } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import {
  getWaitlistMode,
  readRef,
  submitWaitlist,
  type WaitlistMode,
  type WaitlistResult,
} from "@/lib/waitlist";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error" }
  | { kind: "success"; result: WaitlistResult };

const fieldClass =
  "w-full rounded-xl border border-paper/25 bg-paper/10 px-4 py-3 text-paper placeholder:text-paper/50 outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-60";

export function WaitlistForm({ mode = getWaitlistMode() }: { mode?: WaitlistMode }) {
  const t = useTranslations("Waitlist");
  const locale = useLocale() as Locale;
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // State updates are async, so guard against a second submit in the same tick.
  const inFlight = useRef(false);

  if (status.kind === "success") {
    return <Success result={status.result} locale={locale} />;
  }

  const unavailable = mode.kind === "unavailable";
  const submitting = status.kind === "submitting";

  // Replace the browser's validation text with copy in the page's language.
  const handleInvalid: FormEventHandler<HTMLInputElement> = (event) => {
    const input = event.currentTarget;
    const { valueMissing, patternMismatch, typeMismatch } = input.validity;
    if (valueMissing || patternMismatch) {
      input.setCustomValidity(t(input.name === "name" ? "errors.nameMissing" : "errors.emailMissing"));
    } else if (typeMismatch) {
      input.setCustomValidity(t("errors.emailInvalid"));
    }
  };

  const clearCustomValidity: FormEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.setCustomValidity("");
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || unavailable) return;

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    if (data.get("website")) return;

    inFlight.current = true;
    setStatus({ kind: "submitting" });
    try {
      const result = await submitWaitlist(
        {
          name: String(data.get("name")).trim(),
          email: String(data.get("email")).trim(),
          locale,
          ref: readRef(window.location.search),
        },
        mode,
      );
      setStatus({ kind: "success", result });
    } catch {
      setStatus({ kind: "error" });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl">
      <fieldset
        disabled={submitting || unavailable}
        className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <label className="grid gap-1.5 text-sm text-paper/90">
          {t("nameLabel")}
          <input
            name="name"
            required
            maxLength={80}
            pattern=".*\S.*"
            autoComplete="name"
            placeholder={t("namePlaceholder")}
            onInvalid={handleInvalid}
            onInput={clearCustomValidity}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1.5 text-sm text-paper/90">
          {t("emailLabel")}
          <input
            name="email"
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            onInvalid={handleInvalid}
            onInput={clearCustomValidity}
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-gold px-6 py-3 font-heading text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
        </button>
      </fieldset>

      {/* Honeypot: invisible to people and screen readers, tempting to bots. */}
      <div aria-hidden="true" className="sr-only">
        <label>
          {t("honeypot")}
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {status.kind === "error" && (
        <p role="alert" className="mt-4 text-sm text-gold">
          {t("error")}
        </p>
      )}
      {unavailable && <p className="mt-4 text-sm text-paper">{t("unavailable")}</p>}
      <p className="mt-4 text-xs text-paper/70">{t("privacy")}</p>
    </form>
  );
}

function Success({ result, locale }: { result: WaitlistResult; locale: Locale }) {
  const t = useTranslations("Waitlist.success");
  const headingRef = useRef<HTMLParagraphElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const position = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en").format(result.position);

  // The form that had focus is gone; move focus to the result.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      linkRef.current?.select();
    }
  }

  return (
    <div role="status" className="max-w-xl rounded-2xl border border-paper/25 p-6">
      <p ref={headingRef} tabIndex={-1} className="font-heading text-4xl outline-none">
        {t.rich("position", {
          position,
          num: (chunks) => <span className="text-gold">{chunks}</span>,
        })}
      </p>
      <p className="mt-2 text-paper/80">{t("body")}</p>
      <div className="mt-5 flex items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm text-paper/90">
          {t("linkLabel")}
          <input
            ref={linkRef}
            readOnly
            value={result.inviteUrl}
            dir="ltr"
            onFocus={(event) => event.currentTarget.select()}
            className={`${fieldClass} text-sm`}
          />
        </label>
        <button
          type="button"
          onClick={copy}
          className="rounded-xl bg-gold px-4 py-3 font-heading text-ink transition-opacity hover:opacity-90"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, both test files green.

If only the "uses Arabic validation messages" or "rejects a name made only of spaces" test fails because `validationMessage` is the browser default, jsdom did not fire `invalid` before `submit`. Confirm that `handleSubmit` calls `form.reportValidity()`, which fires `invalid` on each invalid control. Do not weaken the test.

- [ ] **Step 6: Lint and commit**

Run: `pnpm lint`
Expected: no errors.

```bash
git add src/components/landing/WaitlistForm.tsx src/components/landing/WaitlistForm.test.tsx messages/en.json messages/ar.json
git commit -m "feat: add waitlist form with success, error and unavailable states

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Page shell (header, hero, join section, footer)

**Files:**
- Create: `src/components/landing/Wordmark.tsx`
- Create: `src/components/landing/LocaleSwitch.tsx`
- Create: `src/components/landing/Header.tsx`
- Create: `src/components/landing/Hero.tsx`
- Create: `src/components/landing/SectionHeading.tsx`
- Create: `src/components/landing/Join.tsx`
- Create: `src/components/landing/Footer.tsx`
- Modify: `src/app/[locale]/page.tsx` (full rewrite)
- Modify: `messages/en.json`, `messages/ar.json` (add `Header`, `LocaleSwitch`, `Hero`, `Footer`; remove `Home`)

**Interfaces:**
- Consumes: `WaitlistForm` (Task 3); `Waitlist.kicker/title/body` messages (Task 3); `routing` from `@/i18n/routing`; tokens, `font-heading`, `font-wordmark`, `.coin` (Task 2).
- Produces (used by Task 5):
  - `export function SectionHeading({ kicker, title, onGreen }: { kicker: string; title: string; onGreen?: boolean }): JSX.Element` renders the kicker `<p>` and an `<h2>`.
  - `src/app/[locale]/page.tsx` renders `<Header />`, then `<main className="flex-1">` containing `<Hero />` and `<Join />`, then `<Footer />`. Task 5 inserts `<Features />` between `Hero` and `Join`, and `<Faq />` plus `<NextSteps />` after `Join`.
  - Shared section container classes: `mx-auto w-full max-w-5xl px-5 md:px-10`.

- [ ] **Step 1: Add the messages and remove `Home`**

In `messages/en.json`, delete the `"Home"` object and add:
```json
  "Header": {
    "home": "Fakka home"
  },
  "LocaleSwitch": {
    "label": "العربية"
  },
  "Hero": {
    "title": "Where did your salary <highlight>go</highlight> this month?",
    "body": "Fakka helps you note every expense in seconds and see exactly where your money went. Made for Egypt, in EGP.",
    "cta": "Join the waitlist",
    "reassure": "Free to join. We’ll email you when it’s ready."
  },
  "Footer": {
    "privacy": "We keep only what the waitlist needs. Never shared or sold.",
    "rights": "© {year} Fakka"
  }
```

In `messages/ar.json`, delete the `"Home"` object and add:
```json
  "Header": {
    "home": "فكّة، الصفحة الرئيسية"
  },
  "LocaleSwitch": {
    "label": "English"
  },
  "Hero": {
    "title": "مرتبك راح <highlight>فين</highlight> الشهر ده؟",
    "body": "فكّة بتساعدك تسجّل كل مصروف في ثواني، وتعرف فلوسك راحت فين بالظبط. معمول لمصر، وبالجنيه.",
    "cta": "سجّل في قايمة الانتظار",
    "reassure": "التسجيل مجاني، وهنبعتلك إيميل أول ما يجهز."
  },
  "Footer": {
    "privacy": "بنحتفظ بس باللي القايمة محتاجاه، وعمرنا ما هنشاركه أو نبيعه.",
    "rights": "© {year} فكّة"
  }
```

- [ ] **Step 2: Create `src/components/landing/Wordmark.tsx`**

```tsx
import { useLocale } from "next-intl";

export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  const locale = useLocale();

  return (
    <span className="flex items-baseline gap-2">
      <span lang="ar" className={`font-wordmark text-ink ${className}`}>
        فكّة
      </span>
      {locale !== "ar" && <span className="font-heading text-sm tracking-wide text-green-deep">Fakka</span>}
    </span>
  );
}
```

- [ ] **Step 3: Create `src/components/landing/LocaleSwitch.tsx`**

```tsx
import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";

export function LocaleSwitch() {
  const t = useTranslations("LocaleSwitch");
  const locale = useLocale();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <a
      href={`/${other}/`}
      hrefLang={other}
      lang={other}
      className="rounded-full border border-ink px-4 py-1.5 text-sm transition-colors hover:bg-ink hover:text-paper"
    >
      {t("label")}
    </a>
  );
}
```

- [ ] **Step 4: Create `src/components/landing/Header.tsx`**

```tsx
import { useLocale, useTranslations } from "next-intl";
import { LocaleSwitch } from "./LocaleSwitch";
import { Wordmark } from "./Wordmark";

export function Header() {
  const t = useTranslations("Header");
  const locale = useLocale();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 md:px-10">
        <a href={`/${locale}/`} aria-label={t("home")}>
          <Wordmark />
        </a>
        <LocaleSwitch />
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Create `src/components/landing/Hero.tsx`**

```tsx
import { useTranslations } from "next-intl";

export function Hero() {
  const t = useTranslations("Hero");

  return (
    <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-5 pt-12 pb-16 md:grid-cols-[1.3fr_1fr] md:px-10 md:pt-20 md:pb-24">
      <div>
        <h1 className="font-heading text-4xl leading-[1.1] text-balance rtl:leading-snug md:text-6xl">
          {t.rich("title", {
            highlight: (chunks) => <span className="text-green">{chunks}</span>,
          })}
        </h1>
        <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-ink-soft">{t("body")}</p>
        <a
          href="#join"
          className="mt-8 inline-block rounded-full bg-green px-6 py-3.5 font-heading text-paper transition-colors hover:bg-green-deep"
        >
          {t("cta")}
        </a>
        <p className="mt-3 text-sm text-ink-soft">{t("reassure")}</p>
      </div>
      <Coins />
    </section>
  );
}

function Coins() {
  return (
    <div aria-hidden="true" className="relative hidden h-64 md:block">
      <span className="coin absolute start-6 top-6 size-36" />
      <span className="coin absolute start-40 top-32 size-24" />
      <span className="coin absolute start-32 top-0 size-16 opacity-85" />
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/landing/SectionHeading.tsx`**

```tsx
export function SectionHeading({
  kicker,
  title,
  onGreen = false,
}: {
  kicker: string;
  title: string;
  onGreen?: boolean;
}) {
  return (
    <>
      <p
        className={`font-heading text-xs tracking-widest uppercase rtl:text-sm rtl:tracking-normal ${
          onGreen ? "text-gold" : "text-green"
        }`}
      >
        {kicker}
      </p>
      <h2 className="mt-2 font-heading text-3xl leading-tight text-balance rtl:leading-snug md:text-4xl">
        {title}
      </h2>
    </>
  );
}
```

- [ ] **Step 7: Create `src/components/landing/Join.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";
import { WaitlistForm } from "./WaitlistForm";

export function Join() {
  const t = useTranslations("Waitlist");

  return (
    <section id="join" className="scroll-mt-6 bg-green text-paper">
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading onGreen kicker={t("kicker")} title={t("title")} />
        <p className="mt-3 text-paper/80">{t("body")}</p>
        <div className="mt-8">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Create `src/components/landing/Footer.tsx`**

```tsx
import { useFormatter, useTranslations } from "next-intl";
import { LocaleSwitch } from "./LocaleSwitch";
import { Wordmark } from "./Wordmark";

export function Footer() {
  const t = useTranslations("Footer");
  const format = useFormatter();
  // No grouping, so English shows "2026" (not "2,026") and Arabic gets Arabic digits.
  const year = format.number(new Date().getFullYear(), { useGrouping: false });

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-8 text-sm text-ink-soft md:flex-row md:items-center md:justify-between md:px-10">
        <Wordmark className="text-xl" />
        <p>{t("privacy")}</p>
        <div className="flex items-center gap-4">
          <LocaleSwitch />
          <span>{t("rights", { year })}</span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 9: Rewrite `src/app/[locale]/page.tsx`**

```tsx
import { setRequestLocale } from "next-intl/server";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Join } from "@/components/landing/Join";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <Join />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 10: Build and check the output**

Run: `pnpm build`
Expected: success.

Run: `grep -c 'id="join"' out/en/index.html out/ar/index.html`
Expected: `1` for each file.

Run: `grep -o 'Sign-ups open very soon.' out/en/index.html`
Expected: one match, because the production build has no endpoint so the form renders as `unavailable`.

Run: `grep -o 'مرتبك راح' out/ar/index.html`
Expected: one match.

- [ ] **Step 11: Check both languages in the browser**

Run: `pnpm dev` and open `http://localhost:3000/en/` and `http://localhost:3000/ar/` at 390×844 and 1280×800.
Expected:
- The header has the wordmark on the start side and the switch on the end side, mirrored in Arabic.
- On a phone, the hero headline, body and button are visible without scrolling.
- The hero button scrolls to the green form.
- In dev the form uses the stub: submitting shows "You’re #N" and a copy button.
- Arabic headings are Thmanyah Serif Display and Arabic body text is Thmanyah Sans.
- No horizontal scroll in either language.

- [ ] **Step 12: Test, lint and commit**

Run: `pnpm test && pnpm lint`
Expected: all pass, no errors.

```bash
git add src/components/landing "src/app/[locale]/page.tsx" messages/en.json messages/ar.json
git commit -m "feat: add landing page shell with header, hero, join section and footer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Features, FAQ and next steps

**Files:**
- Create: `src/components/landing/Features.tsx`
- Create: `src/components/landing/Faq.tsx`
- Create: `src/components/landing/NextSteps.tsx`
- Modify: `src/app/[locale]/page.tsx`
- Modify: `messages/en.json`, `messages/ar.json` (add `Features`, `Faq`, `NextSteps`)

**Interfaces:**
- Consumes: `SectionHeading` (Task 4); tokens and `font-heading` (Task 2).
- Produces: `Features`, `Faq`, `NextSteps` server components with no props.

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add:
```json
  "Features": {
    "kicker": "What Fakka does",
    "title": "Small change, finally visible.",
    "items": {
      "fast": {
        "title": "Add it in seconds",
        "body": "Paid for something? Note the amount and what it was for, and you’re done."
      },
      "month": {
        "title": "See your month",
        "body": "How much you spent, and on what. One clear look each month."
      },
      "egypt": {
        "title": "Made for Egypt",
        "body": "Amounts in EGP. Use it in Arabic or English."
      }
    }
  },
  "Faq": {
    "kicker": "Questions",
    "title": "Good to know",
    "items": {
      "what": {
        "q": "What is Fakka?",
        "a": "An upcoming app that helps you track your personal expenses. Add what you spend in seconds, and at the end of the month you’ll see how much went where."
      },
      "who": {
        "q": "Who is it for?",
        "a": "Anyone in Egypt with a monthly salary or freelance income who wants to know where it goes. If you manage your money on your phone, it’s for you."
      },
      "when": {
        "q": "When does it launch?",
        "a": "We haven’t set a date yet. Join the waitlist and you’ll be among the first to hear."
      },
      "queue": {
        "q": "How does the queue work?",
        "a": "When you join, you get a place in the queue and your own invite link. Each friend who joins through it moves you up. You can’t invite yourself, and each friend counts once."
      },
      "data": {
        "q": "What do you do with my data?",
        "a": "We keep only what the waitlist needs: your name, email, language, when you joined, and who invited you. We never share or sell it, and we only email you about Fakka’s launch."
      }
    }
  },
  "NextSteps": {
    "kicker": "Coming soon",
    "title": "What happens next",
    "steps": {
      "join": {
        "title": "Join the list",
        "body": "It takes ten seconds, and you get your place right away."
      },
      "invite": {
        "title": "Invite friends",
        "body": "Share your link. Every friend who joins moves you up."
      },
      "receive": {
        "title": "Get your invite",
        "body": "When it’s your turn, we’ll email you."
      }
    },
    "cta": "Save my spot"
  }
```

In `messages/ar.json`, add:
```json
  "Features": {
    "kicker": "فكّة بتعمل إيه؟",
    "title": "الفكّة اللي بتضيع، أخيرًا قدام عينك.",
    "items": {
      "fast": {
        "title": "سجّل في ثواني",
        "body": "دفعت حاجة؟ اكتب المبلغ وكان على إيه، وخلاص."
      },
      "month": {
        "title": "شوف شهرك",
        "body": "صرفت كام، وعلى إيه. نظرة واحدة واضحة كل شهر."
      },
      "egypt": {
        "title": "معمول لمصر",
        "body": "المبالغ بالجنيه المصري، وتقدر تستخدمه بالعربي أو بالإنجليزي."
      }
    }
  },
  "Faq": {
    "kicker": "أسئلة",
    "title": "أسئلة على السريع",
    "items": {
      "what": {
        "q": "فكّة إيه؟",
        "a": "تطبيق جاي قريب بيساعدك تتابع مصاريفك. تسجّل اللي بتصرفه في ثواني، وآخر الشهر تعرف صرفت كام وعلى إيه."
      },
      "who": {
        "q": "معمول لمين؟",
        "a": "لأي حد في مصر بياخد مرتب شهري أو بيشتغل فريلانس، ونفسه يعرف فلوسه بتروح فين. لو بتدير فلوسك من موبايلك، يبقى فكّة ليك."
      },
      "when": {
        "q": "هينزل إمتى؟",
        "a": "لسه ما حددناش ميعاد. سجّل في قايمة الانتظار وهتبقى من أول الناس اللي تعرف."
      },
      "queue": {
        "q": "الدور ماشي إزاي؟",
        "a": "أول ما تسجّل بتاخد مكان في الدور ولينك دعوة خاص بيك. كل صاحب يسجّل من اللينك ده بيقدّمك. مينفعش تدعي نفسك، وكل صاحب بيتحسب مرة واحدة."
      },
      "data": {
        "q": "هتعملوا إيه ببياناتي؟",
        "a": "بنحتفظ بس باللي القايمة محتاجاه: اسمك، وإيميلك، ولغتك، وإمتى سجّلت، ومين دعاك. عمرنا ما هنشاركها أو نبيعها، ومش هنبعتلك غير عن إطلاق فكّة."
      }
    }
  },
  "NextSteps": {
    "kicker": "قريب",
    "title": "إيه اللي جاي؟",
    "steps": {
      "join": {
        "title": "سجّل",
        "body": "عشر ثواني، وتعرف مكانك على طول."
      },
      "invite": {
        "title": "ادعي صحابك",
        "body": "ابعت اللينك بتاعك. كل صاحب يسجّل بيقدّمك."
      },
      "receive": {
        "title": "استلم دعوتك",
        "body": "لما ييجي دورك، هنبعتلك إيميل."
      }
    },
    "cta": "احجز مكاني"
  }
```

- [ ] **Step 2: Create `src/components/landing/Features.tsx`**

```tsx
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const ITEMS = ["fast", "month", "egypt"] as const;

const ICONS: Record<(typeof ITEMS)[number], ReactNode> = {
  fast: (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  month: (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </svg>
  ),
  egypt: (
    <span lang="ar" className="font-wordmark text-sm">
      ج.م
    </span>
  ),
};

export function Features() {
  const t = useTranslations("Features");

  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading kicker={t("kicker")} title={t("title")} />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {ITEMS.map((key) => (
            <li key={key} className="rounded-2xl bg-green-tint p-6">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-green text-paper">
                {ICONS[key]}
              </span>
              <h3 className="mt-5 font-heading text-lg">{t(`items.${key}.title`)}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `src/components/landing/Faq.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const QUESTIONS = ["what", "who", "when", "queue", "data"] as const;

export function Faq() {
  const t = useTranslations("Faq");

  return (
    <section>
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading kicker={t("kicker")} title={t("title")} />
        <div className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
          {QUESTIONS.map((key) => (
            <details key={key} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-lg [&::-webkit-details-marker]:hidden">
                {t(`items.${key}.q`)}
                <span
                  aria-hidden="true"
                  className="text-2xl leading-none text-green transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-soft">{t(`items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `src/components/landing/NextSteps.tsx`**

```tsx
import { useFormatter, useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const STEPS = ["join", "invite", "receive"] as const;

export function NextSteps() {
  const t = useTranslations("NextSteps");
  const format = useFormatter();

  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-10 md:py-24">
        <SectionHeading kicker={t("kicker")} title={t("title")} />
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((key, index) => (
            <li key={key} className="flex gap-4 md:flex-col">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-green font-heading text-green"
              >
                {format.number(index + 1)}
              </span>
              <div>
                <h3 className="font-heading text-lg">{t(`steps.${key}.title`)}</h3>
                <p className="mt-1 leading-relaxed text-ink-soft">{t(`steps.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <a
          href="#join"
          className="mt-10 inline-block rounded-full bg-green px-6 py-3.5 font-heading text-paper transition-colors hover:bg-green-deep"
        >
          {t("cta")}
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add the sections to `src/app/[locale]/page.tsx`**

Replace the imports and `<main>` so the file reads:
```tsx
import { setRequestLocale } from "next-intl/server";
import { Faq } from "@/components/landing/Faq";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Join } from "@/components/landing/Join";
import { NextSteps } from "@/components/landing/NextSteps";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <Join />
        <Faq />
        <NextSteps />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 6: Build and check the output**

Run: `pnpm build`
Expected: success, with no `MISSING_MESSAGE` warnings in the output.

Run: `grep -c '<details' out/en/index.html out/ar/index.html`
Expected: each file contains the five FAQ items. `grep -c` counts lines, so if the HTML is on one line use `grep -o '<details' out/en/index.html | wc -l` and expect `5`.

- [ ] **Step 7: Check in the browser**

Run: `pnpm dev`, then open `/en/` and `/ar/` at 390×844 and 1280×800.
Expected:
- Feature cards and steps stack on a phone and sit in three columns on desktop.
- FAQ items open and close, and the `+` rotates.
- Arabic step numbers show as ١ ٢ ٣.
- Section order: hero, features, green form, FAQ, next steps, footer.
- No horizontal scroll.

- [ ] **Step 8: Test, lint and commit**

Run: `pnpm test && pnpm lint`
Expected: all pass, no errors.

```bash
git add src/components/landing "src/app/[locale]/page.tsx" messages/en.json messages/ar.json
git commit -m "feat: add features, FAQ and next steps sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Keep invite codes through the root redirect, document, verify

**Files:**
- Modify: `src/app/page.tsx:8`
- Modify: `AGENTS.md` (Architecture section)

**Interfaces:**
- Consumes: everything above.
- Produces: the finished branch.

- [ ] **Step 1: Preserve query and hash in the root redirect**

In `src/app/page.tsx`, replace:
```js
  location.replace("/" + locale + "/");
```
with:
```js
  location.replace("/" + locale + "/" + location.search + location.hash);
```

- [ ] **Step 2: Document the endpoint**

In `AGENTS.md`, under `### Architecture`, add after the "Fully static." bullet:
```markdown
- **Waitlist endpoint.** The form posts `{ name, email, locale, ref }` to
  `NEXT_PUBLIC_WAITLIST_ENDPOINT` and expects `200 { position, inviteUrl }`
  (`src/lib/waitlist.ts`). The value is inlined at build time. Without it,
  `pnpm dev` uses a local stub and production builds show the form as disabled
  ("Sign-ups open very soon"). Invite links carry `?ref=`; the root `/` redirect
  keeps the query string.
```

- [ ] **Step 3: Full verification**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all pass.

Run: `pnpm preview`, then open `http://localhost:8787/?ref=abc123` in a browser whose language is English.
Expected: the address bar ends at `/en/?ref=abc123`.

Run: `NEXT_PUBLIC_WAITLIST_ENDPOINT=https://httpbin.org/status/500 pnpm build && grep -c 'Sign-ups open very soon' out/en/index.html || true`
Expected: `0`, because with an endpoint configured the form is enabled. Rebuild afterwards with plain `pnpm build`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx AGENTS.md
git commit -m "fix: keep invite codes through the root locale redirect

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
