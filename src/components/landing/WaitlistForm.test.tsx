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
