import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../checkout/route.ts`.
 *
 * The address a calendar can subscribe to, and what it carries. Four verbs on
 * one file rather than four files, the same arrangement as `../tokens/route.ts`
 * and for the same reason: they are one thing from the caller's point of view.
 *
 * The feed itself is not here. It lives at `./[token]/route.ts`, because it is
 * fetched by machines that have never heard of this application and needs
 * different treatment in `proxy.ts`.
 */

// `node:crypto` generates the secret, and it is unavailable on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = proRoute("calendar-read");
export const POST = proRoute("calendar-create");
export const PATCH = proRoute("calendar-update");
export const DELETE = proRoute("calendar-revoke");
