-- Only what the waitlist needs (see docs/faka-product-brief.md, Privacy).
CREATE TABLE signups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT, -- join order
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,                  -- as typed, used to send
  email_key      TEXT    NOT NULL UNIQUE,           -- normalized: one person, one place
  locale         TEXT    NOT NULL CHECK (locale IN ('en', 'ar')),
  invite_code    TEXT    NOT NULL UNIQUE,
  referred_by    INTEGER REFERENCES signups (id),   -- who invited whom
  referral_count INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL                   -- ISO 8601 join time
);
