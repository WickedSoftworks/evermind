import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../checkout/route.ts`.
 *
 * When this account wants telling about a deadline. Four verbs on one file, the
 * same arrangement as `../tokens/route.ts`.
 *
 * Sending is `./send/route.ts`, which is called by a schedule rather than by a
 * browser and is excluded from `proxy.ts` for that reason.
 */

export const dynamic = "force-dynamic";

export const GET = proRoute("reminders-read");
export const PUT = proRoute("reminders-write");
export const POST = proRoute("reminders-rule-create");
export const DELETE = proRoute("reminders-rule-delete");
