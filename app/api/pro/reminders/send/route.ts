import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../../checkout/route.ts`.
 *
 * Called on a timer rather than by a person, which makes it the second route in
 * this application with no session at all — the first being the payment
 * callback. It is listed in `proxy.ts` alongside that one, for the same reason:
 * there is no cookie to refresh, and the round trip would be latency on a caller
 * that times out.
 *
 * Where the timer lives is not in this repository, and in a build without the
 * optional module there is no timer and this is a 404.
 */

// The module compares a shared secret with `node:crypto`, unavailable on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = proRoute("reminders-send");
