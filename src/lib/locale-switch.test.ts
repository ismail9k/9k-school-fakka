import { afterEach, expect, it } from "vitest";
import { localeSwitchScript } from "./locale-switch";

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

it("keeps the invite code through a language switch before hydration", () => {
  window.history.replaceState({}, "", "/en/?ref=friend42#join");
  new Function(localeSwitchScript)();

  const link = document.createElement("a");
  link.href = "/ar/";
  link.dataset.localeSwitch = "";
  link.addEventListener("click", (event) => event.preventDefault());
  document.body.append(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

  const destination = new URL(link.href);
  expect(`${destination.pathname}${destination.search}${destination.hash}`).toBe(
    "/ar/?ref=friend42#join",
  );
});
