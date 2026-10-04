// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { D1Database } from "./env";
import { createSignup, generateInviteCode, getPosition, type SignupInput } from "./store";
import { createTestD1 } from "./test/sqlite-d1";

let db: D1Database;
let n = 0;

function person(id: string, ref: string | null = null): SignupInput {
  return {
    name: id,
    email: `${id}@example.com`,
    emailKey: `${id}@example.com`,
    locale: "en",
    ref,
    createdAt: new Date(2026, 9, 4, 0, 0, n++).toISOString(),
  };
}

async function join(id: string, ref: string | null = null) {
  return (await createSignup(db, person(id, ref))).signup;
}

async function positions(...ids: number[]) {
  return Promise.all(ids.map((id) => getPosition(db, id, 5)));
}

beforeEach(() => {
  db = createTestD1();
});

describe("generateInviteCode", () => {
  it("makes 8 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    }
  });
});

describe("createSignup", () => {
  it("creates a signup with its locale and an invite code", async () => {
    const { signup, created } = await createSignup(db, { ...person("mona"), locale: "ar" });
    expect(created).toBe(true);
    expect(signup.locale).toBe("ar");
    expect(signup.inviteCode).toMatch(/^[a-z2-9]{8}$/);
  });

  it("returns the existing entry for the same email key without changing it", async () => {
    const first = await join("mona");
    const again = await createSignup(db, { ...person("mona"), name: "Other", locale: "ar" });
    expect(again).toEqual({ signup: first, created: false });
    const row = await db.prepare("SELECT name, locale FROM signups").first();
    expect(row).toEqual({ name: "mona", locale: "en" });
  });

  it("credits the inviter once when a new person joins with their code", async () => {
    const inviter = await join("a");
    await join("b", inviter.inviteCode);
    const row = await db.prepare("SELECT referral_count FROM signups WHERE id = ?").bind(inviter.id).first();
    expect(row).toEqual({ referral_count: 1 });
    const friend = await db.prepare("SELECT referred_by FROM signups WHERE email_key = ?").bind("b@example.com").first();
    expect(friend).toEqual({ referred_by: inviter.id });
  });

  it("does not credit anyone when an existing email submits again with a ref", async () => {
    const inviter = await join("a");
    await join("b");
    await createSignup(db, person("b", inviter.inviteCode));
    const row = await db.prepare("SELECT referral_count FROM signups WHERE id = ?").bind(inviter.id).first();
    expect(row).toEqual({ referral_count: 0 });
  });

  it("does not credit you for re-submitting with your own code", async () => {
    const me = await join("a");
    await createSignup(db, person("a", me.inviteCode));
    const row = await db.prepare("SELECT referral_count FROM signups WHERE id = ?").bind(me.id).first();
    expect(row).toEqual({ referral_count: 0 });
  });

  it("ignores an unknown ref", async () => {
    const { created } = await createSignup(db, person("a", "zzzzzzzz"));
    expect(created).toBe(true);
    const row = await db.prepare("SELECT referred_by FROM signups").first();
    expect(row).toEqual({ referred_by: null });
  });

  it("keeps one row when the same person joins twice at the same moment", async () => {
    const [x, y] = await Promise.all([createSignup(db, person("a")), createSignup(db, person("a"))]);
    expect(x.signup).toEqual(y.signup);
    expect([x.created, y.created].sort()).toEqual([false, true]);
    const row = await db.prepare("SELECT COUNT(*) AS n FROM signups").first();
    expect(row).toEqual({ n: 1 });
  });

  it("retries with a new code when the invite code collides", async () => {
    await createSignup(db, person("a"), () => "aaaaaaaa");
    const codes = ["aaaaaaaa", "bbbbbbbb"];
    const { signup } = await createSignup(db, person("b"), () => codes.shift()!);
    expect(signup.inviteCode).toBe("bbbbbbbb");
  });

  it("gives up after three collisions", async () => {
    await createSignup(db, person("a"), () => "aaaaaaaa");
    await expect(createSignup(db, person("b"), () => "aaaaaaaa")).rejects.toThrow();
    const row = await db.prepare("SELECT COUNT(*) AS n FROM signups").first();
    expect(row).toEqual({ n: 1 });
  });
});

describe("getPosition", () => {
  it("orders by join order without referrals", async () => {
    const ids: number[] = [];
    for (const p of ["a", "b", "c"]) ids.push((await join(p)).id);
    expect(await positions(...ids)).toEqual([1, 2, 3]);
  });

  it("moves an inviter up N places per referral", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 9; i++) ids.push((await join(`p${i}`)).id);
    const last = (await join("late")).id; // join order 10
    const lateCode = (await db.prepare("SELECT invite_code FROM signups WHERE id = ?").bind(last).first<{ invite_code: string }>())!.invite_code;
    await join("friend", lateCode); // join order 11; late's score 10 - 5 = 5
    // Scores: p0..p8 → 1..9, late → 5, friend → 11. Tie with p4 (score 5): p4 joined earlier.
    expect(await getPosition(db, last, 5)).toBe(6);
    expect(await getPosition(db, ids[4], 5)).toBe(5);
    expect(await getPosition(db, ids[5], 5)).toBe(7);
  });

  it("uses the configured jump", async () => {
    await join("a");
    await join("b");
    const c = await join("c");
    await join("d", c.inviteCode);
    // c joined third with one referral: score = 3 − jump. Scores: a 1, b 2, d 4.
    expect(await getPosition(db, c.id, 0)).toBe(3); // score 3
    expect(await getPosition(db, c.id, 1)).toBe(3); // score 2 ties b; b joined earlier
    expect(await getPosition(db, c.id, 2)).toBe(2); // score 1 ties a; a joined earlier
    expect(await getPosition(db, c.id, 3)).toBe(1); // score 0 beats everyone
  });
});
