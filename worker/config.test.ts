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
