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
