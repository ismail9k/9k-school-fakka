// Minimal hand-written binding types. The root tsconfig uses the DOM lib, so
// the generated Workers runtime types would clash; these cover what we use.

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  // Runs the statements in one transaction: all succeed or none apply.
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  DB: D1Database;
  WAITLIST_LIMITER: RateLimit;
  // Unset on Workers Previews; readConfig then uses the request origin.
  SITE_URL?: string;
  EMAIL_FROM: string;
  REFERRAL_JUMP: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
}
