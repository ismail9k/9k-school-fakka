# Privacy and Terms Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add static, bilingual `/{locale}/privacy/` and `/{locale}/terms/` pages, linked from the footer, with clearly marked placeholders for operator name, contact email, and governing law.

**Architecture:** Copy lives in `messages/{en,ar}.json` (`Legal`, `Privacy`, `Terms` namespaces; sections read with `t.raw`). One config file (`src/lib/legal.ts`) holds the operator details, `null` until known; null renders as a marked placeholder and turns on a draft notice. A shared `LegalPage` component renders Header, article, and Footer; `PrivacyContent`/`TermsContent` fix each page's section order and extras; the route files only set the locale and metadata.

**Tech Stack:** Next.js 16 static export, next-intl 4, React 19, Tailwind CSS v4, Vitest 5 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-04-privacy-and-terms-pages-design.md`
Intent-Issue: #4 — https://github.com/ismail9k/9k-school-fakka/issues/4

## Global Constraints

- Privacy content follows the brief: we keep only name, email, preferred language, join time and who invited whom; never share or sell it; only email about Fakka's launch.
- Terms cover the waitlist and invites only; no app, account, or payment yet; never promise a launch date, price, or feature.
- Operator name, contact email, governing law are `null` in `src/lib/legal.ts` and render as visibly marked placeholders (`<mark data-placeholder>`).
- Every user-facing string goes in both `messages/en.json` and `messages/ar.json`; use the exact copy in this plan (it is already written naturally per language).
- Logical Tailwind utilities only (`ms-`, `ps-`, `pe-`, `start-`), never `ml-`/`pl-`/`left-`.
- Internal links use trailing-slash locale paths (`/en/privacy/`).
- Every page under `src/app/[locale]/` calls `setRequestLocale(locale)`.
- No server features: no route handlers, middleware, or server actions.
- Test files must type-check: `pnpm exec next typegen && pnpm exec tsc --noEmit` passes.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Switching language on a legal page must land on the same legal page in the other language, not the landing page. Test in Task 2 (`LocaleSwitch` with `path`) and Task 4 (header switch on Privacy points at `/ar/privacy/`).
2. Arabic and English copy drifting apart (a paragraph or bullet added to one only). Test in Task 3 (whole-file shape parity, including array lengths).
3. Filling in only some details must keep the draft notice and keep marking the remaining placeholders. Test in Task 1 (`hasMissingDetails` with one null) and Task 4 (partial details).
4. The contact email, once set, must be a working `mailto:` link that reads left to right inside Arabic text. Test in Task 1 (`dir="ltr"`, `href`).
5. The "Last updated" date must not shift a day by time zone and must use Arabic-Indic digits in Arabic. Test in Task 1 (`formatDate` with `timeZone: "UTC"`).

---

### Task 1: Legal details config, date formatting, and details list

**Files:**
- Create: `src/lib/legal.ts`, `src/lib/legal.test.ts`
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`
- Create: `src/components/legal/LegalDetails.tsx`, `src/components/legal/LegalDetails.test.tsx`
- Modify: `messages/en.json`, `messages/ar.json` (add `Legal` namespace)

**Interfaces:**
- Produces:
  - `type LegalDetails = { operatorName: Record<Locale, string> | null; contactEmail: string | null; governingLaw: Record<Locale, string> | null }`
  - `const LEGAL_DETAILS: LegalDetails` (all null), `const LEGAL_LAST_UPDATED = "2026-10-04"`
  - `function hasMissingDetails(details: LegalDetails): boolean`
  - `function formatDate(isoDate: string, locale: Locale): string` in `src/lib/format.ts`
  - `type DetailKind = "operator" | "contact" | "law"`
  - `function DetailsList(props: { kinds: DetailKind[]; details: LegalDetails }): JSX.Element` in `src/components/legal/LegalDetails.tsx`

- [ ] **Step 1: Add the `Legal` namespace to both message files**

Add as a new top-level key (after `"Footer"`) in `messages/en.json`:

```json
"Legal": {
  "updated": "Last updated: {date}",
  "draftNotice": "This page is still a draft. Anything in [square brackets] is still being confirmed.",
  "details": {
    "operator": "Run by",
    "contact": "Email",
    "law": "Governing law"
  },
  "placeholders": {
    "operator": "[Operator name — to be confirmed]",
    "contact": "[Contact email — to be confirmed]",
    "law": "[Governing law — to be confirmed]"
  },
  "privacyLink": "Read our privacy policy"
}
```

And in `messages/ar.json`:

```json
"Legal": {
  "updated": "آخر تحديث: {date}",
  "draftNotice": "الصفحة دي لسه مسودة. أي حاجة بين [القوسين] لسه بنأكدها.",
  "details": {
    "operator": "مين بيدير فكّة",
    "contact": "الإيميل",
    "law": "القانون المطبّق"
  },
  "placeholders": {
    "operator": "[اسم الجهة — لسه هيتأكد]",
    "contact": "[إيميل التواصل — لسه هيتأكد]",
    "law": "[القانون المطبّق — لسه هيتأكد]"
  },
  "privacyLink": "اقرا سياسة الخصوصية"
}
```

- [ ] **Step 2: Write failing tests**

`src/lib/legal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasMissingDetails, LEGAL_DETAILS, type LegalDetails } from "./legal";

const filled: LegalDetails = {
  operatorName: { en: "Fakka Ltd", ar: "شركة فكّة" },
  contactEmail: "privacy@example.com",
  governingLaw: { en: "the laws of Egypt", ar: "قوانين مصر" },
};

describe("hasMissingDetails", () => {
  it("is true while every detail is a placeholder", () => {
    expect(hasMissingDetails(LEGAL_DETAILS)).toBe(true);
  });

  it("is false once every detail is filled", () => {
    expect(hasMissingDetails(filled)).toBe(false);
  });

  it("is true when only one detail is still missing", () => {
    expect(hasMissingDetails({ ...filled, governingLaw: null })).toBe(true);
  });
});
```

Append to `src/lib/format.test.ts` (keep existing tests; add `formatDate` to the import from `./format`):

```ts
describe("formatDate", () => {
  it("writes a long English date", () => {
    expect(formatDate("2026-10-04", "en")).toBe("October 4, 2026");
  });

  it("writes an Arabic date with Arabic-Indic digits", () => {
    expect(formatDate("2026-10-04", "ar")).toBe("٤ أكتوبر ٢٠٢٦");
  });
});
```

`src/components/legal/LegalDetails.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import type { LegalDetails } from "@/lib/legal";
import { DetailsList } from "./LegalDetails";

const empty: LegalDetails = { operatorName: null, contactEmail: null, governingLaw: null };
const filled: LegalDetails = {
  operatorName: { en: "Fakka Ltd", ar: "شركة فكّة" },
  contactEmail: "privacy@example.com",
  governingLaw: { en: "the laws of Egypt", ar: "قوانين مصر" },
};

function renderList(details: LegalDetails, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <DetailsList kinds={["operator", "contact", "law"]} details={details} />
    </NextIntlClientProvider>,
  );
}

describe("DetailsList", () => {
  it("marks every missing detail as a placeholder", () => {
    const { container } = renderList(empty);
    const marks = container.querySelectorAll("mark[data-placeholder]");
    expect(marks).toHaveLength(3);
    expect(screen.getByText("[Operator name — to be confirmed]")).toBeInTheDocument();
    expect(screen.getByText("[Contact email — to be confirmed]")).toBeInTheDocument();
    expect(screen.getByText("[Governing law — to be confirmed]")).toBeInTheDocument();
  });

  it("shows labels for each detail", () => {
    renderList(empty);
    expect(screen.getByText("Run by")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Governing law")).toBeInTheDocument();
  });

  it("shows filled details in the page's language, with a mailto link", () => {
    const { container } = renderList(filled, "ar");
    expect(container.querySelectorAll("mark[data-placeholder]")).toHaveLength(0);
    expect(screen.getByText("شركة فكّة")).toBeInTheDocument();
    expect(screen.getByText("قوانين مصر")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "privacy@example.com" });
    expect(link).toHaveAttribute("href", "mailto:privacy@example.com");
    expect(link).toHaveAttribute("dir", "ltr");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/legal.test.ts src/lib/format.test.ts src/components/legal/LegalDetails.test.tsx`
Expected: FAIL (modules / `formatDate` not found).

- [ ] **Step 4: Implement**

`src/lib/legal.ts`:

```ts
import type { Locale } from "@/i18n/routing";

type PerLocale = Record<Locale, string>;

export type LegalDetails = {
  operatorName: PerLocale | null;
  contactEmail: string | null;
  governingLaw: PerLocale | null;
};

// Placeholders until the real details exist. Replace a null with the real
// value and the Privacy and Terms pages drop its placeholder mark; once none
// is null, the draft notice disappears too.
export const LEGAL_DETAILS: LegalDetails = {
  operatorName: null,
  contactEmail: null,
  governingLaw: null,
};

// Bump when the Privacy or Terms copy changes (YYYY-MM-DD).
export const LEGAL_LAST_UPDATED = "2026-10-04";

export function hasMissingDetails(details: LegalDetails): boolean {
  return details.operatorName === null || details.contactEmail === null || details.governingLaw === null;
}
```

Append to `src/lib/format.ts`:

```ts
// Takes a calendar date (YYYY-MM-DD) and formats it in UTC so it never shifts a day.
export function formatDate(isoDate: string, locale: Locale): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
```

`src/components/legal/LegalDetails.tsx`:

```tsx
import { useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";
import type { Locale } from "@/i18n/routing";
import type { LegalDetails } from "@/lib/legal";

export type DetailKind = "operator" | "contact" | "law";

function valueFor(kind: DetailKind, details: LegalDetails, locale: Locale): string | null {
  if (kind === "operator") return details.operatorName?.[locale] ?? null;
  if (kind === "law") return details.governingLaw?.[locale] ?? null;
  return details.contactEmail;
}

function Detail({ kind, value }: { kind: DetailKind; value: string | null }) {
  const t = useTranslations("Legal");
  if (value === null) {
    return (
      <mark data-placeholder className="rounded bg-gold/40 px-1 text-ink">
        {t(`placeholders.${kind}`)}
      </mark>
    );
  }
  if (kind === "contact") {
    return (
      <a href={`mailto:${value}`} dir="ltr" className="text-green underline underline-offset-4">
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

export function DetailsList({ kinds, details }: { kinds: DetailKind[]; details: LegalDetails }) {
  const t = useTranslations("Legal");
  const locale = useLocale() as Locale;

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg border border-line p-4 sm:grid-cols-[auto_1fr]">
      {kinds.map((kind) => (
        <Fragment key={kind}>
          <dt className="text-ink-soft">{t(`details.${kind}`)}</dt>
          <dd>
            <Detail kind={kind} value={valueFor(kind, details, locale)} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/legal.test.ts src/lib/format.test.ts src/components/legal/LegalDetails.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/legal.ts src/lib/legal.test.ts src/lib/format.ts src/lib/format.test.ts src/components/legal messages/en.json messages/ar.json
git commit -m "feat(legal): operator details config with marked placeholders"
```

---

### Task 2: Footer legal links and same-page language switch

**Files:**
- Modify: `src/components/landing/LocaleSwitch.tsx`, `src/components/landing/Header.tsx`, `src/components/landing/Footer.tsx`
- Modify: `messages/en.json`, `messages/ar.json` (`Footer` namespace)
- Create: `src/components/landing/Footer.test.tsx`

**Interfaces:**
- Produces: `LocaleSwitch({ path?: string })`, `Header({ path?: string })`, `Footer({ path?: string })`. `path` is relative to the locale root with a trailing slash (`"privacy/"`), default `""`.

- [ ] **Step 1: Add footer link copy**

In `messages/en.json`, `Footer` gains:

```json
"legalNav": "Legal",
"privacyLink": "Privacy",
"termsLink": "Terms"
```

In `messages/ar.json`, `Footer` gains:

```json
"legalNav": "روابط قانونية",
"privacyLink": "الخصوصية",
"termsLink": "الشروط"
```

- [ ] **Step 2: Write failing tests**

`src/components/landing/Footer.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { Footer } from "./Footer";
import { LocaleSwitch } from "./LocaleSwitch";

function withIntl(node: React.ReactNode, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("Footer", () => {
  it("links to the privacy and terms pages in the current language", () => {
    withIntl(<Footer />, "ar");
    const nav = screen.getByRole("navigation", { name: "روابط قانونية" });
    expect(within(nav).getByRole("link", { name: "الخصوصية" })).toHaveAttribute("href", "/ar/privacy/");
    expect(within(nav).getByRole("link", { name: "الشروط" })).toHaveAttribute("href", "/ar/terms/");
  });

  it("switches language to the same page", () => {
    withIntl(<Footer path="terms/" />);
    expect(screen.getByRole("link", { name: "العربية" })).toHaveAttribute("href", "/ar/terms/");
  });
});

describe("LocaleSwitch", () => {
  it("points at the other language's home by default", () => {
    withIntl(<LocaleSwitch />);
    expect(screen.getByRole("link", { name: "العربية" })).toHaveAttribute("href", "/ar/");
  });

  it("keeps the current page when given a path", () => {
    withIntl(<LocaleSwitch path="privacy/" />, "ar");
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/privacy/");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run src/components/landing/Footer.test.tsx`
Expected: FAIL (no navigation landmark; `path` ignored).

- [ ] **Step 4: Implement**

`LocaleSwitch.tsx`: accept `{ path = "" }: { path?: string }` and use `href={\`/${other}/${path}\`}`.

`Header.tsx`: accept `{ path = "" }: { path?: string }` and render `<LocaleSwitch path={path} />`. The home link stays `/${locale}/`.

`Footer.tsx`: accept `{ path = "" }: { path?: string }`; render `<LocaleSwitch path={path} />`; add the nav between the privacy line and the switch/rights group:

```tsx
<nav aria-label={t("legalNav")} className="flex gap-4">
  <a href={`/${locale}/privacy/`} className="underline-offset-4 hover:text-ink hover:underline">
    {t("privacyLink")}
  </a>
  <a href={`/${locale}/terms/`} className="underline-offset-4 hover:text-ink hover:underline">
    {t("termsLink")}
  </a>
</nav>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/components/landing`
Expected: PASS (including existing `WaitlistForm` tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/landing messages/en.json messages/ar.json
git commit -m "feat(footer): link privacy and terms, keep page on language switch"
```

---

### Task 3: Privacy and Terms copy, with message parity test

**Files:**
- Modify: `messages/en.json`, `messages/ar.json` (add `Privacy`, `Terms`)
- Create: `src/i18n/messages.test.ts`

**Interfaces:**
- Produces: namespaces `Privacy` and `Terms`, each `{ metaTitle, metaDescription, title, intro, sections: Record<string, { title: string; paragraphs?: string[]; items?: string[] }> }`.
  - Privacy section keys, in order: `who, keep, why, emails, notKept, helpers, howLong, choices, changes`
  - Terms section keys, in order: `what, joining, queue, invites, promises, data, changes, law, contact`

- [ ] **Step 1: Write the parity test**

`src/i18n/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

// Same keys everywhere, and the same number of paragraphs and bullets, so the
// two languages can't drift apart.
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shape((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value;
}

describe("messages", () => {
  it("have the same shape in English and Arabic", () => {
    expect(shape(ar)).toEqual(shape(en));
  });

  it("include the privacy and terms pages", () => {
    expect(Object.keys(en.Privacy.sections)).toEqual([
      "who", "keep", "why", "emails", "notKept", "helpers", "howLong", "choices", "changes",
    ]);
    expect(Object.keys(en.Terms.sections)).toEqual([
      "what", "joining", "queue", "invites", "promises", "data", "changes", "law", "contact",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/i18n/messages.test.ts`
Expected: FAIL (`en.Privacy` undefined — may also fail type-check-wise; vitest still runs).

- [ ] **Step 3: Add the copy**

Add to `messages/en.json` (top-level, after `Legal`):

```json
"Privacy": {
  "metaTitle": "Privacy — Fakka",
  "metaDescription": "What the Fakka waitlist keeps, why, and how to reach us.",
  "title": "Privacy",
  "intro": "You gave us your name and email to join the Fakka waitlist. Here’s exactly what we do with them, in plain words.",
  "sections": {
    "who": {
      "title": "Who runs Fakka",
      "paragraphs": ["Fakka and its waitlist are run by the people below. If you have a question about your details, ask us here."]
    },
    "keep": {
      "title": "What we keep",
      "paragraphs": ["Only what the waitlist needs:"],
      "items": [
        "Your name",
        "Your email",
        "The language you signed up in",
        "When you joined",
        "Who invited you, and who joined with your invite link"
      ]
    },
    "why": {
      "title": "Why we keep it",
      "paragraphs": ["To give you a place in the queue, make your own invite link, move you up when friends join, and email you about Fakka’s launch. That’s all."]
    },
    "emails": {
      "title": "Emails we send",
      "paragraphs": [
        "Right after you join, we send one email with your place in the queue and your invite link. After that, we only email you about Fakka’s launch, in the language you signed up in.",
        "No newsletters, no ads, and nothing from anyone else."
      ]
    },
    "notKept": {
      "title": "What we don’t keep",
      "items": [
        "We don’t store your IP address. Cloudflare looks at it, and at your browser, only to check you’re a real person and to stop repeated tries.",
        "No ads, no analytics, and no tracking cookies.",
        "If you open an invite link, your browser remembers its code until you close the tab, so your friend gets the credit. It stays on your device."
      ]
    },
    "helpers": {
      "title": "Who helps us run it",
      "paragraphs": [
        "We never sell your details, and we never share them with anyone for their own use.",
        "Two services handle them for us, only to run the waitlist:"
      ],
      "items": [
        "Cloudflare: runs the site, stores the waitlist, and checks for bots.",
        "Resend: sends our emails."
      ]
    },
    "howLong": {
      "title": "How long we keep it",
      "paragraphs": ["Only as long as the waitlist needs it. You can ask us to delete it at any time."]
    },
    "choices": {
      "title": "Your choices",
      "paragraphs": ["You can ask to see the details we have about you, fix them, or delete them. Just email us at the address below. If you delete them, you also give up your place in the queue."]
    },
    "changes": {
      "title": "If this changes",
      "paragraphs": ["If we change how we handle your details, we’ll update this page and the date at the top."]
    }
  }
},
"Terms": {
  "metaTitle": "Terms — Fakka",
  "metaDescription": "The rules of the Fakka waitlist and invites.",
  "title": "Terms",
  "intro": "These are the rules of the Fakka waitlist. They’re short, and they only cover the waitlist and invites.",
  "sections": {
    "what": {
      "title": "What this is",
      "paragraphs": ["Fakka is an app we’re still building. Right now there’s only a waitlist: no app, no account, and nothing to pay for."]
    },
    "joining": {
      "title": "Joining the waitlist",
      "items": [
        "It’s free.",
        "Use your own name and an email you can read.",
        "One person, one place: the same email joins only once, however it’s typed."
      ]
    },
    "queue": {
      "title": "Your place in the queue",
      "paragraphs": ["We show your place when you join. It can change as other people invite friends, so treat it as a guide, not a promise of when you’ll be invited."]
    },
    "invites": {
      "title": "Inviting friends",
      "items": [
        "Each friend who joins with your link moves you up the queue.",
        "You can’t invite yourself, and each friend counts once.",
        "Fake, automated or made-up sign-ups aren’t allowed. We may remove sign-ups that break these rules, along with any places they earned."
      ]
    },
    "promises": {
      "title": "What we can’t promise yet",
      "paragraphs": [
        "Fakka’s launch date, price and features aren’t final. Joining the waitlist doesn’t guarantee you access, a price or a feature.",
        "We may change the waitlist or stop it. If we do, we’ll update this page."
      ]
    },
    "data": {
      "title": "Your details",
      "paragraphs": ["What we keep, and why, is on our privacy page."]
    },
    "changes": {
      "title": "Changes to these terms",
      "paragraphs": ["If we change these terms, we’ll update this page and the date at the top."]
    },
    "law": {
      "title": "Governing law",
      "paragraphs": ["These terms are governed by the law below."]
    },
    "contact": {
      "title": "Questions?",
      "paragraphs": ["Email us and we’ll get back to you."]
    }
  }
}
```

Add to `messages/ar.json` (top-level, after `Legal`):

```json
"Privacy": {
  "metaTitle": "الخصوصية — فكّة",
  "metaDescription": "بنحتفظ بإيه من قائمة انتظار فكّة، وليه، وتكلمنا إزاي.",
  "title": "الخصوصية",
  "intro": "إنت إديتنا اسمك وإيميلك علشان تدخل قائمة انتظار فكّة. هنا هتعرف بالظبط بنعمل بيهم إيه، بكلام بسيط.",
  "sections": {
    "who": {
      "title": "مين بيدير فكّة",
      "paragraphs": ["فكّة وقائمة الانتظار بتاعتها بيديرهم الناس اللي تحت. لو عندك أي سؤال عن بياناتك، اسألنا هنا."]
    },
    "keep": {
      "title": "بنحتفظ بإيه",
      "paragraphs": ["اللي قائمة الانتظار محتاجاه وبس:"],
      "items": [
        "اسمك",
        "إيميلك",
        "اللغة اللي سجّلت بيها",
        "إمتى سجّلت",
        "مين عزمك، ومين سجّل من لينك الدعوة بتاعك"
      ]
    },
    "why": {
      "title": "ليه بنحتفظ بيه",
      "paragraphs": ["علشان نديك مكانك في الدور، ونعملك لينك دعوة خاص بيك، ونقدّمك لما صحابك يسجّلوا، ونبعتلك عن إطلاق فكّة. بس كده."]
    },
    "emails": {
      "title": "الإيميلات اللي بنبعتها",
      "paragraphs": [
        "أول ما تسجّل، بنبعتلك إيميل واحد فيه مكانك في الدور ولينك الدعوة بتاعك. بعد كده مش هنبعتلك غير عن إطلاق فكّة، وباللغة اللي سجّلت بيها.",
        "لا نشرات، ولا إعلانات، ولا رسايل من أي حد تاني."
      ]
    },
    "notKept": {
      "title": "اللي مش بنحتفظ بيه",
      "items": [
        "مش بنخزّن عنوان الـ IP بتاعك. Cloudflare بتبص عليه وعلى المتصفح بتاعك بس علشان تتأكد إنك شخص حقيقي وتوقف المحاولات المتكررة.",
        "مفيش إعلانات، ولا أدوات تحليل، ولا كوكيز بتتتبعك.",
        "لو فتحت لينك دعوة، المتصفح بتاعك بيفتكر الكود بتاعه لحد ما تقفل التاب، علشان صاحبك ياخد حقه. الكود ده بيفضل على جهازك."
      ]
    },
    "helpers": {
      "title": "مين بيساعدنا",
      "paragraphs": [
        "عمرنا ما هنبيع بياناتك، ولا هنديها لحد يستخدمها لنفسه.",
        "فيه خدمتين بس بيتعاملوا معاها نيابةً عننا، علشان قائمة الانتظار تشتغل:"
      ],
      "items": [
        "Cloudflare: بتشغّل الموقع، وبتخزّن قائمة الانتظار، وبتتأكد إن اللي بيسجّل مش روبوت.",
        "Resend: بتبعت الإيميلات بتاعتنا."
      ]
    },
    "howLong": {
      "title": "هنحتفظ بيه لحد إمتى",
      "paragraphs": ["طول ما قائمة الانتظار محتاجاه وبس. وتقدر تطلب مننا نمسحه في أي وقت."]
    },
    "choices": {
      "title": "القرار في إيدك",
      "paragraphs": ["تقدر تطلب تشوف بياناتك اللي عندنا، أو تصلّحها، أو تمسحها. ابعتلنا على الإيميل اللي تحت. لو مسحتها، هتسيب مكانك في الدور كمان."]
    },
    "changes": {
      "title": "لو حاجة اتغيّرت",
      "paragraphs": ["لو غيّرنا طريقة تعاملنا مع بياناتك، هنحدّث الصفحة دي والتاريخ اللي فوق."]
    }
  }
},
"Terms": {
  "metaTitle": "الشروط — فكّة",
  "metaDescription": "قواعد قائمة انتظار فكّة والدعوات.",
  "title": "الشروط",
  "intro": "دي قواعد قائمة انتظار فكّة. قصيرة، وبتتكلم عن قائمة الانتظار والدعوات بس.",
  "sections": {
    "what": {
      "title": "ده إيه بالظبط",
      "paragraphs": ["فكّة تطبيق لسه بنبنيه. دلوقتي فيه قائمة انتظار بس: مفيش تطبيق، ولا حساب، ولا حاجة تدفع فلوسها."]
    },
    "joining": {
      "title": "التسجيل في قائمة الانتظار",
      "items": [
        "التسجيل ببلاش.",
        "سجّل باسمك، وبإيميل بتاعك وبتفتحه.",
        "كل واحد له مكان واحد: الإيميل نفسه بيسجّل مرة واحدة بس، مهما اتكتب بأشكال مختلفة."
      ]
    },
    "queue": {
      "title": "مكانك في الدور",
      "paragraphs": ["بنوريك مكانك أول ما تسجّل. ممكن يتغيّر لما ناس تانية تعزم صحابها، فاعتبره مؤشر، مش وعد بميعاد دعوتك."]
    },
    "invites": {
      "title": "عزومة صحابك",
      "items": [
        "كل صاحب يسجّل من اللينك بتاعك بيقدّمك في الدور.",
        "مينفعش تعزم نفسك، وكل صاحب بيتحسب مرة واحدة.",
        "ممنوع التسجيل الوهمي أو الأوتوماتيك أو بإيميلات متألفة. ممكن نشيل أي تسجيل يكسر القواعد دي، ومعاه أي تقدّم في الدور جه منه."
      ]
    },
    "promises": {
      "title": "اللي مش هنقدر نوعدك بيه دلوقتي",
      "paragraphs": [
        "ميعاد إطلاق فكّة وسعرها ومميزاتها لسه مش نهائية. دخولك قائمة الانتظار مش ضمان إنك هتستخدم التطبيق، ولا لسعر أو ميزة معيّنة.",
        "ممكن نغيّر قائمة الانتظار أو نوقفها. لو حصل، هنحدّث الصفحة دي."
      ]
    },
    "data": {
      "title": "بياناتك",
      "paragraphs": ["بنحتفظ بإيه وليه، مكتوب في صفحة الخصوصية."]
    },
    "changes": {
      "title": "لو الشروط اتغيّرت",
      "paragraphs": ["لو غيّرنا الشروط دي، هنحدّث الصفحة دي والتاريخ اللي فوق."]
    },
    "law": {
      "title": "القانون المطبّق",
      "paragraphs": ["الشروط دي بيحكمها القانون اللي تحت."]
    },
    "contact": {
      "title": "عندك سؤال؟",
      "paragraphs": ["ابعتلنا إيميل وهنرد عليك."]
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/ar.json src/i18n/messages.test.ts
git commit -m "feat(legal): privacy and terms copy in English and Arabic"
```

---

### Task 4: LegalPage, PrivacyContent and TermsContent components

**Files:**
- Create: `src/components/legal/LegalPage.tsx`, `src/components/legal/PrivacyContent.tsx`, `src/components/legal/TermsContent.tsx`
- Create: `src/components/legal/LegalPage.test.tsx`

**Interfaces:**
- Consumes: `DetailsList`, `LegalDetails`, `hasMissingDetails`, `LEGAL_LAST_UPDATED` (Task 1); `Header({ path })`, `Footer({ path })` (Task 2); `Privacy`/`Terms`/`Legal` messages (Tasks 1, 3); `formatDate` (Task 1).
- Produces: `PrivacyContent({ details }: { details: LegalDetails })`, `TermsContent({ details }: { details: LegalDetails })`.

- [ ] **Step 1: Write failing tests**

`src/components/legal/LegalPage.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import type { LegalDetails } from "@/lib/legal";
import { PrivacyContent } from "./PrivacyContent";
import { TermsContent } from "./TermsContent";

const empty: LegalDetails = { operatorName: null, contactEmail: null, governingLaw: null };
const filled: LegalDetails = {
  operatorName: { en: "Fakka Ltd", ar: "شركة فكّة" },
  contactEmail: "privacy@example.com",
  governingLaw: { en: "the laws of Egypt", ar: "قوانين مصر" },
};

function withIntl(node: React.ReactNode, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("PrivacyContent", () => {
  it("renders the title, date and every section in English", () => {
    withIntl(<PrivacyContent details={empty} />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText("Last updated: October 4, 2026")).toBeInTheDocument();
    for (const section of Object.values(en.Privacy.sections)) {
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
    }
    expect(screen.getByText("Your email")).toBeInTheDocument();
    expect(screen.getByText("Resend: sends our emails.")).toBeInTheDocument();
  });

  it("shows the draft notice and marked placeholders while details are missing", () => {
    const { container } = withIntl(<PrivacyContent details={empty} />);
    expect(screen.getByRole("note")).toHaveTextContent(en.Legal.draftNotice);
    expect(container.querySelectorAll("mark[data-placeholder]").length).toBeGreaterThan(0);
  });

  it("keeps the notice when only some details are filled", () => {
    withIntl(<PrivacyContent details={{ ...filled, governingLaw: null }} />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("drops the notice and placeholders once details are filled", () => {
    const { container } = withIntl(<PrivacyContent details={filled} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(container.querySelectorAll("mark[data-placeholder]")).toHaveLength(0);
    expect(screen.getByText("Fakka Ltd")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "privacy@example.com" })[0]).toHaveAttribute(
      "href",
      "mailto:privacy@example.com",
    );
  });

  it("renders in Arabic and switches language to the same page", () => {
    withIntl(<PrivacyContent details={empty} />, "ar");
    expect(screen.getByRole("heading", { level: 1, name: "الخصوصية" })).toBeInTheDocument();
    expect(screen.getByText("آخر تحديث: ٤ أكتوبر ٢٠٢٦")).toBeInTheDocument();
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: ar.LocaleSwitch.label })).toHaveAttribute("href", "/en/privacy/");
  });
});

describe("TermsContent", () => {
  it("renders every section and links to the privacy page", () => {
    withIntl(<TermsContent details={empty} />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms" })).toBeInTheDocument();
    for (const section of Object.values(en.Terms.sections)) {
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Read our privacy policy" })).toHaveAttribute("href", "/en/privacy/");
    expect(screen.getByText("[Governing law — to be confirmed]")).toBeInTheDocument();
  });

  it("switches language to the Arabic terms page", () => {
    withIntl(<TermsContent details={empty} />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: en.LocaleSwitch.label })).toHaveAttribute("href", "/ar/terms/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/components/legal/LegalPage.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `LegalPage`**

`src/components/legal/LegalPage.tsx`:

```tsx
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { hasMissingDetails, LEGAL_LAST_UPDATED, type LegalDetails } from "@/lib/legal";

type Section = { title: string; paragraphs?: string[]; items?: string[] };

export function LegalPage({
  namespace,
  path,
  sections,
  details,
  extras = {},
}: {
  namespace: "Privacy" | "Terms";
  path: string;
  sections: readonly string[];
  details: LegalDetails;
  extras?: Partial<Record<string, ReactNode>>;
}) {
  const t = useTranslations(namespace);
  const tl = useTranslations("Legal");
  const locale = useLocale() as Locale;

  return (
    <>
      <Header path={path} />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-3xl px-5 py-12 md:px-10 md:py-16">
          <h1 className="font-heading text-4xl leading-tight md:text-5xl">{t("title")}</h1>
          <p className="mt-3 text-sm text-ink-soft">
            {tl("updated", { date: formatDate(LEGAL_LAST_UPDATED, locale) })}
          </p>
          {hasMissingDetails(details) && (
            <p role="note" className="mt-6 rounded-lg border border-gold bg-gold/15 p-4 text-sm">
              {tl("draftNotice")}
            </p>
          )}
          <p className="mt-8 text-lg leading-relaxed">{t("intro")}</p>
          {sections.map((key) => {
            const section = t.raw(`sections.${key}`) as Section;
            return (
              <section key={key} aria-labelledby={`${key}-title`} className="mt-10">
                <h2 id={`${key}-title`} className="font-heading text-2xl">
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph, i) => (
                  <p key={i} className="mt-3 leading-relaxed text-ink-soft">
                    {paragraph}
                  </p>
                ))}
                {section.items && (
                  <ul className="mt-3 list-disc space-y-2 ps-5 leading-relaxed text-ink-soft">
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
                {extras[key]}
              </section>
            );
          })}
        </article>
      </main>
      <Footer path={path} />
    </>
  );
}
```

- [ ] **Step 4: Implement `PrivacyContent` and `TermsContent`**

`src/components/legal/PrivacyContent.tsx`:

```tsx
import type { LegalDetails } from "@/lib/legal";
import { DetailsList } from "./LegalDetails";
import { LegalPage } from "./LegalPage";

const SECTIONS = ["who", "keep", "why", "emails", "notKept", "helpers", "howLong", "choices", "changes"] as const;

export function PrivacyContent({ details }: { details: LegalDetails }) {
  return (
    <LegalPage
      namespace="Privacy"
      path="privacy/"
      sections={SECTIONS}
      details={details}
      extras={{
        who: <DetailsList kinds={["operator", "contact"]} details={details} />,
        choices: <DetailsList kinds={["contact"]} details={details} />,
      }}
    />
  );
}
```

`src/components/legal/TermsContent.tsx`:

```tsx
import { useLocale, useTranslations } from "next-intl";
import type { LegalDetails } from "@/lib/legal";
import { DetailsList } from "./LegalDetails";
import { LegalPage } from "./LegalPage";

const SECTIONS = ["what", "joining", "queue", "invites", "promises", "data", "changes", "law", "contact"] as const;

export function TermsContent({ details }: { details: LegalDetails }) {
  const t = useTranslations("Legal");
  const locale = useLocale();

  return (
    <LegalPage
      namespace="Terms"
      path="terms/"
      sections={SECTIONS}
      details={details}
      extras={{
        what: <DetailsList kinds={["operator"]} details={details} />,
        data: (
          <p className="mt-3">
            <a href={`/${locale}/privacy/`} className="text-green underline underline-offset-4">
              {t("privacyLink")}
            </a>
          </p>
        ),
        law: <DetailsList kinds={["law"]} details={details} />,
        contact: <DetailsList kinds={["contact"]} details={details} />,
      }}
    />
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/components/legal`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/legal
git commit -m "feat(legal): privacy and terms page components"
```

---

### Task 5: Routes, metadata, and static build check

**Files:**
- Create: `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/terms/page.tsx`
- Modify: `AGENTS.md` (one architecture line)

**Interfaces:**
- Consumes: `PrivacyContent`, `TermsContent` (Task 4), `LEGAL_DETAILS` (Task 1), `routing` (`src/i18n/routing.ts`).

- [ ] **Step 1: Read the bundled Next.js docs for `generateMetadata` and `PageProps`**

Run: `ls node_modules/next/dist/docs/` and read the page on metadata / dynamic route props; confirm `PageProps<"/[locale]/privacy">` is the generated helper (it is used as `PageProps<"/[locale]">` in `src/app/[locale]/page.tsx`).

- [ ] **Step 2: Create the Privacy route**

`src/app/[locale]/privacy/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { routing } from "@/i18n/routing";
import { LEGAL_DETAILS } from "@/lib/legal";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/privacy/`])),
    },
  };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PrivacyContent details={LEGAL_DETAILS} />;
}
```

- [ ] **Step 3: Create the Terms route**

`src/app/[locale]/terms/page.tsx`: same as above with `Terms`, `terms/`, `TermsContent`, and `PageProps<"/[locale]/terms">`:

```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TermsContent } from "@/components/legal/TermsContent";
import { routing } from "@/i18n/routing";
import { LEGAL_DETAILS } from "@/lib/legal";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Terms" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/terms/`])),
    },
  };
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <TermsContent details={LEGAL_DETAILS} />;
}
```

- [ ] **Step 4: Note the pages in AGENTS.md**

Under `### Architecture`, after the "Layout split" bullet, add:

```markdown
- **Privacy and Terms.** `/{locale}/privacy/` and `/{locale}/terms/` render
  `src/components/legal/*` from the `Legal`, `Privacy`, and `Terms` message
  namespaces. Operator name, contact email, and governing law live in
  `src/lib/legal.ts` (`null` = marked placeholder plus a draft notice); bump
  `LEGAL_LAST_UPDATED` when the copy changes.
```

- [ ] **Step 5: Verify**

Run each and confirm:
- `pnpm test` → all pass.
- `pnpm lint` → no errors.
- `pnpm exec next typegen && pnpm exec tsc --noEmit` → no errors.
- `pnpm build` → succeeds; then
  `ls out/en/privacy/index.html out/ar/privacy/index.html out/en/terms/index.html out/ar/terms/index.html`
  and `grep -o 'dir="rtl"' out/ar/privacy/index.html | head -1` → `dir="rtl"`;
  `grep -o '<title>[^<]*</title>' out/en/privacy/index.html` → `<title>Privacy — Fakka</title>`;
  `grep -c 'href="/en/privacy/"' out/en/index.html` → at least 1.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/privacy" "src/app/[locale]/terms" AGENTS.md
git commit -m "feat(legal): privacy and terms routes for both languages"
```
