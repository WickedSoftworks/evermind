import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../../checkout/route.ts`.
 *
 * What an optional module has found and not yet been told what to do with, and
 * the answer. Its own path rather than more verbs on `../route.ts`, for the
 * reason `./sync/route.ts` gives: this one is called while somebody is looking
 * at a dialog, and deserves a rate limit that is not shared with connecting.
 */

// Deciding fingerprints what it writes, which needs `node:crypto`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = proRoute("canvas-pending-read");
export const POST = proRoute("canvas-pending-decide");
