import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../checkout/route.ts`.
 *
 * Whether this account keeps its coursework in step with a Canvas, and which
 * one. Three verbs on one file, the same arrangement as `../tokens/route.ts`.
 *
 * Running a sync is `./sync/route.ts`, separately, because it is called by a
 * page as well as by a person and deserves its own rate limit.
 */

// `node:crypto` encrypts the credential this route is given, and it is
// unavailable on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = proRoute("canvas-read");
export const PUT = proRoute("canvas-connect");
export const DELETE = proRoute("canvas-disconnect");
