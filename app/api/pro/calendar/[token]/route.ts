import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../../checkout/route.ts`.
 *
 * The calendar document itself. The segment is the credential: there is no
 * session here, because the callers are Google's, Apple's and Outlook's
 * fetchers, none of which has one.
 *
 * `proRoute` hands the handler the `Request` and nothing else, so the segment is
 * read back out of the URL rather than taken from the route context. That keeps
 * every shell in this repository the same shape, and this one still says nothing
 * about what the module does with it.
 *
 * Also listed in `proxy.ts`, which skips the session refresh for exactly this
 * path — there is no cookie to refresh, and the round trip would be latency on
 * every poll of every subscribed calendar.
 */

// `node:crypto` is reached through the module that resolves the segment, and it
// is unavailable on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = proRoute("calendar-feed");
