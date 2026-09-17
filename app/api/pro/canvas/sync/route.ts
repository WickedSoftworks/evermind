import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../../checkout/route.ts`.
 *
 * Asks the optional module to bring this account's coursework up to date. Called
 * both by a button in settings and by the dashboard when it opens, which is the
 * nearest thing this project has to a schedule — there is no cron here, for the
 * reason `docs/architecture.md` gives, and the retention sweep works the same
 * way.
 *
 * Whether anything actually happens is the module's decision, not this file's.
 */

// The module decrypts a stored credential to do this, which needs `node:crypto`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = proRoute("canvas-sync");
