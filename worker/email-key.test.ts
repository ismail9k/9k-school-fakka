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
