import { NextResponse } from "next/server";

/**
 * A fixed-window rate limiter held in the process's own memory.
 *
 * Audit M10: nothing in the app is throttled. This covers the part that can be
 * covered — see the honest limits below before relying on it.
 *
 * **What this does not cover.** Evermind is deliberately thin: the browser
 * talks to Postgres directly through the Supabase client, so assignment writes
 * and the Canvas import never pass through a Next.js route and cannot be
 * throttled from here. Sign-in is Supabase's own OAuth flow, throttled in the
 * Supabase dashboard under Authentication → Rate Limits. What is left is the
 * two `/api/account/*` routes, which is what this module guards.
 *
 * **State is per-instance.** A serverless deployment runs several instances, so
 * the effective limit is roughly `limit x instances`, and a cold start clears
 * the counters. That is fine for the job here — stopping a runaway client loop
 * and blunting one user hammering an expensive endpoint — and useless as a
 * defence against a distributed attacker. A public instance expecting real
 * abuse wants a limit at the proxy or a shared store; `docs/self-hosting.md`
 * §5 says so.
 */
interface Window {
  count: number;
  /** Epoch milliseconds at which `count` resets to zero. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Above this many tracked keys, expired entries are swept before inserting a
 * new one. The map is otherwise unbounded, and this process may be long-lived.
 */
const SWEEP_THRESHOLD = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Whole seconds until the window resets. Only meaningful when blocked. */
  retryAfter: number;
}

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

/**
 * Counts one hit against `key` and reports whether it is allowed.
 *
 * @param key      what is being limited — include the subject, e.g. `export:<user id>`
 * @param limit    hits permitted per window
 * @param windowMs length of the window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= SWEEP_THRESHOLD) {
      sweep(now);
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  return { allowed: true, retryAfter: 0 };
}

/**
 * The client caller for a rate-limited route.
 *
 * `delete-account-dialog.tsx` and `export-data-button.tsx` both render
 * `body.error` verbatim when a response is not ok, so the message here is what
 * the user reads.
 */
export function tooManyRequests(result: RateLimitResult, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": String(result.retryAfter) } });
}

/**
 * The caller's address, for limiting requests that have no session yet.
 *
 * `x-forwarded-for` is only as trustworthy as whatever set it — a client can
 * send whatever it likes when nothing overwrites the header, so treat the
 * per-address limits as a guard against accidental floods rather than against
 * a determined attacker. Vercel and any sane reverse proxy set it correctly.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
