/**
 * Is this request coming from one of our own pages?
 *
 * Audit M10: `POST /api/account/delete` takes no body and is guarded only by
 * the session cookie. Supabase's auth cookies default to `SameSite=Lax`, which
 * does block a cross-site form POST — but that safety comes entirely from a
 * default this app never sets and never asserts. Checking here removes the
 * dependency on it.
 *
 * Two signals, in order of trustworthiness:
 *
 * 1. `Sec-Fetch-Site`, set by the browser and unreachable from page JavaScript.
 *    When it is present it is the whole answer. `same-origin` is required
 *    rather than `same-site`, because a destructive endpoint has no reason to
 *    accept a sibling subdomain.
 * 2. `Origin`, for browsers too old to send the first (Safari below 16.4).
 *    Browsers send it on every POST, including same-origin ones.
 *
 * Only the host is compared, not the full origin: behind a TLS-terminating
 * proxy Next may see `http:` internally while the browser reports `https:`.
 * That distinction does not matter here — an attacker's page is on a different
 * host either way.
 *
 * A request carrying neither header is rejected. Nothing in the app makes one;
 * only a non-browser client like curl would, and this endpoint exists for the
 * settings page alone.
 */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin";
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    // A malformed Origin is not one of ours.
    return false;
  }
}
