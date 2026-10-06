import type { Env } from "./env";

export type Config = { siteUrl: string; emailFrom: string; referralJump: number };

export const DEFAULT_REFERRAL_JUMP = 5;
const DEFAULT_SITE_URL = "https://fakka.com";
const DEFAULT_EMAIL_FROM = "Fakka <hello@fakka.com>";

// Without SITE_URL (Workers Previews), links point back at the origin that
// served the request, so a preview's invite links stay on that preview.
export function readConfig(
  env: Pick<Env, "SITE_URL" | "EMAIL_FROM" | "REFERRAL_JUMP">,
  requestOrigin?: string,
): Config {
  const jump = env.REFERRAL_JUMP?.trim() ?? "";
  return {
    siteUrl: (env.SITE_URL || requestOrigin || DEFAULT_SITE_URL).replace(/\/+$/, ""),
    emailFrom: env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    // How many places each referral moves the inviter up. Changeable as a var.
    referralJump: /^\d+$/.test(jump) ? Number(jump) : DEFAULT_REFERRAL_JUMP,
  };
}
