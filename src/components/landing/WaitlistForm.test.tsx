import { render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import type { WaitlistMode } from "@/lib/waitlist";
import { WaitlistForm } from "./WaitlistForm";

const remote: WaitlistMode = {
  kind: "remote",
  endpoint: "https://api.example.com/waitlist",
  turnstileSiteKey: "site-key",
};
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

const joined = () =>
  Promise.resolve(new Response(JSON.stringify({ position: 1234, inviteUrl: INVITE }), { status: 200 }));

async function fillAndSubmit(user: UserEvent, name = "Mona", email = "mona@example.com") {
  await user.type(screen.getByLabelText("Your name"), name);
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Join" }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/en/");
  window.sessionStorage.clear();
  stubTurnstile();
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
      turnstileToken: "token-1",
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

  it("keeps the invite code after switching language", async () => {
    window.history.replaceState({}, "", "/en/?ref=friend42");
    const first = renderForm();
    first.unmount();
    window.history.replaceState({}, "", "/ar/");
    const fetch = stubFetch(joined);
    const user = userEvent.setup();
    renderForm({ locale: "ar" });

    await user.type(screen.getByLabelText("اسمك"), "منى");
    await user.type(screen.getByLabelText("إيميلك"), "mona@example.com");
    await user.click(screen.getByRole("button", { name: "سجّلني" }));
    await screen.findByRole("status");

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).ref).toBe("friend42");
  });

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

  it("renders disabled until hydrated, so an early submit cannot put the email in the URL", () => {
    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={en}>
        <WaitlistForm mode={remote} />
      </NextIntlClientProvider>,
    );

    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });
});
