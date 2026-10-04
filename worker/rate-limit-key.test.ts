// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rateLimitKey } from "./rate-limit-key";

describe("rateLimitKey", () => {
  it("keys IPv4 addresses as they are", () => {
    expect(rateLimitKey("1.2.3.4")).toBe("1.2.3.4");
  });

  it("shares one bucket when the IP is unknown", () => {
    expect(rateLimitKey(null)).toBe("unknown");
    expect(rateLimitKey("")).toBe("unknown");
  });

  it("keys a full IPv6 address by its /64", () => {
    expect(rateLimitKey("2001:0db8:85a3:0000:1111:2222:3333:4444")).toBe("2001:db8:85a3:0::/64");
  });

  it("gives every address in the same /64 the same key", () => {
    const a = rateLimitKey("2001:db8:85a3:0:1111:2222:3333:4444");
    expect(rateLimitKey("2001:db8:85a3::1")).toBe(a);
    expect(rateLimitKey("2001:DB8:85A3:0:ffff::")).toBe(a);
  });

  it("expands :: before taking the prefix", () => {
    expect(rateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("keys different /64s apart", () => {
    expect(rateLimitKey("2001:db8:0:1::1")).not.toBe(rateLimitKey("2001:db8:0:2::1"));
  });

  it("keys IPv4-mapped IPv6 addresses by the IPv4 address", () => {
    expect(rateLimitKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
  });

  it("falls back to the raw value for something it can't parse", () => {
    expect(rateLimitKey("1::2::3")).toBe("1::2::3");
    expect(rateLimitKey("zz::1")).toBe("zz::1");
  });
});
