/**
 * The Content-Security-Policy, built per request because it carries a nonce.
 *
 * The static headers (HSTS, frame options, referrer and permissions policy) live in
 * `next.config.mjs` instead, so they also cover static assets, which the proxy does
 * not run for. This one has to be here: a nonce is only worth anything if it is
 * different on every response.
 */

/** Where the browser talks to Supabase, derived from the URL the client already uses. */
function supabaseOrigins(): string[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const { origin, host } = new URL(url);
    // Auth and Postgrest are HTTPS; realtime, if it is ever used, is a WebSocket.
    return [origin, `wss://${host}`];
  } catch {
    return [];
  }
}

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV !== "production";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    /**
     * Next.js emits an inline bootstrap script on every page, so a nonce is the only
     * way to allow it without allowing every inline script. Next adds this nonce to
     * its own tags once it sees the policy on the request; the two theme scripts in
     * the root layout take it from the `x-nonce` header.
     *
     * `strict-dynamic` then lets those trusted scripts load the chunks and the
     * analytics beacon, which is injected from JS. `https:` and `unsafe-inline` are
     * the CSP2 fallback for browsers that do not implement `strict-dynamic` — those
     * browsers ignore the nonce, and these ignore the fallback.
     */
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https:",
      "'unsafe-inline'",
      // The dev server compiles modules with eval; production never needs it.
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],

    // `next/font` inlines an @font-face block, the theme provider injects a
    // stylesheet, and the app uses React `style` props throughout.
    "style-src": ["'self'", "'unsafe-inline'"],

    // Avatars come from whichever OAuth provider the deployment uses, so the host
    // is not knowable here. Images cannot execute, so any HTTPS source is allowed.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],

    "connect-src": ["'self'", ...supabaseOrigins(), "https://va.vercel-scripts.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],

    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // The app holds a live session, so it must not be framable at all.
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}
