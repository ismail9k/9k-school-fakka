import type { Locale } from "../src/i18n/routing";
import type { D1Database } from "./env";
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "./validate";

export type Signup = { id: number; locale: Locale; inviteCode: string };

export type SignupInput = {
  name: string;
  email: string;
  emailKey: string;
  locale: Locale;
  ref: string | null;
  createdAt: string;
};

type SignupRow = { id: number; locale: Locale; invite_code: string };

const MAX_CODE_ATTEMPTS = 3;
// Largest multiple of the alphabet size that fits in a byte, to avoid modulo bias.
const BYTE_LIMIT = 256 - (256 % INVITE_CODE_ALPHABET.length);

export function generateInviteCode(): string {
  let code = "";
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH))) {
      if (byte < BYTE_LIMIT && code.length < INVITE_CODE_LENGTH) {
        code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
      }
    }
  }
  return code;
}

async function findByEmailKey(db: D1Database, key: string): Promise<Signup | null> {
  const row = await db
    .prepare("SELECT id, locale, invite_code FROM signups WHERE email_key = ?")
    .bind(key)
    .first<SignupRow>();
  return row && { id: row.id, locale: row.locale, inviteCode: row.invite_code };
}

async function findInviterId(db: D1Database, code: string): Promise<number | null> {
  const row = await db.prepare("SELECT id FROM signups WHERE invite_code = ?").bind(code).first<{ id: number }>();
  return row?.id ?? null;
}

// Returns the existing entry when the email is already on the list: one person,
// one place, and a second submission never credits a referral.
export async function createSignup(
  db: D1Database,
  input: SignupInput,
  generateCode: () => string = generateInviteCode,
): Promise<{ signup: Signup; created: boolean }> {
  const existing = await findByEmailKey(db, input.emailKey);
  if (existing) return { signup: existing, created: false };

  const inviterId = input.ref ? await findInviterId(db, input.ref) : null;

  for (let attempt = 1; ; attempt++) {
    const insert = db
      .prepare(
        `INSERT INTO signups (name, email, email_key, locale, invite_code, referred_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(input.name, input.email, input.emailKey, input.locale, generateCode(), inviterId, input.createdAt);
    const statements = [insert];
    if (inviterId !== null) {
      statements.push(
        db.prepare("UPDATE signups SET referral_count = referral_count + 1 WHERE id = ?").bind(inviterId),
      );
    }

    try {
      // One transaction: the referral counts only if the new signup is written.
      await db.batch(statements);
    } catch (error) {
      // Either the same email won a race (return it) or the code collided (retry).
      const raced = await findByEmailKey(db, input.emailKey);
      if (raced) return { signup: raced, created: false };
      if (attempt >= MAX_CODE_ATTEMPTS) throw error;
      continue;
    }

    const signup = await findByEmailKey(db, input.emailKey);
    if (!signup) throw new Error("Signup vanished after insert");
    return { signup, created: true };
  }
}

// Score = join order − jump × referrals; lower is better, earlier join wins ties.
// Join order is the rank by id, so AUTOINCREMENT gaps don't shift anyone.
export async function getPosition(db: D1Database, id: number, referralJump: number): Promise<number> {
  const row = await db
    .prepare(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id) - ? * referral_count AS score
         FROM signups
       ),
       me AS (SELECT id AS me_id, score AS me_score FROM ranked WHERE id = ?)
       SELECT COUNT(*) + 1 AS position
       FROM ranked, me
       WHERE ranked.score < me.me_score
          OR (ranked.score = me.me_score AND ranked.id < me.me_id)`,
    )
    .bind(referralJump, id)
    .first<{ position: number }>();
  if (!row) throw new Error("Position query returned nothing");
  return row.position;
}
