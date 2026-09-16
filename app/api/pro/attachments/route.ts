import { proRoute } from "@/lib/pro/shell";

/**
 * A shell — see `../checkout/route.ts`.
 *
 * Files kept alongside an assignment. Four verbs on one file, the same
 * arrangement as `../tokens/route.ts` and for the same reason.
 *
 * `POST` and `PUT` are two halves of one upload rather than two operations. The
 * module explains why it is split; from out here the only thing worth knowing is
 * that the bytes do not travel through this route, so nothing here needs a body
 * size limit raised.
 */

// `node:crypto` names the object, and it is unavailable on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = proRoute("attachments-list");
export const POST = proRoute("attachments-authorise");
export const PUT = proRoute("attachments-confirm");
export const DELETE = proRoute("attachments-delete");
