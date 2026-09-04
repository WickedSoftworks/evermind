import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/security/origin";
import { clientAddress, rateLimit, tooManyRequests } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Enough to retry a failed deletion a few times; far short of a loop. */
const PER_USER_LIMIT = 5;
const PER_USER_WINDOW_MS = 10 * 60 * 1000;

/**
 * A coarse guard on the work done before the session is known — `getUser()` is
 * a network call to Supabase, so an unauthenticated flood is not free. Set high
 * enough that a shared address (a school's NAT, say) never trips it.
 */
const PER_ADDRESS_LIMIT = 30;
const PER_ADDRESS_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  // Checked before anything else: it costs nothing and needs no session.
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "This request did not come from Evermind" }, { status: 403 });
  }

  const byAddress = rateLimit(
    `account-delete:addr:${clientAddress(request)}`,
    PER_ADDRESS_LIMIT,
    PER_ADDRESS_WINDOW_MS,
  );
  if (!byAddress.allowed) {
    return tooManyRequests(byAddress, "Too many requests. Please wait a moment and try again.");
  }

  const supabase = await createClient();

  // The id comes from the session cookie, never from the request body, so a
  // caller can only ever delete themselves.
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Keyed by user id rather than address, so one person on a shared network
  // cannot exhaust everyone else's budget.
  const byUser = rateLimit(`account-delete:user:${data.user.id}`, PER_USER_LIMIT, PER_USER_WINDOW_MS);
  if (!byUser.allowed) {
    return tooManyRequests(byUser, "Too many deletion attempts. Please wait a few minutes and try again.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Account deletion is not configured on this server" }, { status: 500 });
  }

  // Deleting the auth user removes their assignments too: assignments.user_id
  // references auth.users(id) ON DELETE CASCADE.
  const { error: deleteError } = await createAdminClient().auth.admin.deleteUser(data.user.id);

  if (deleteError) {
    console.error("Account deletion failed:", deleteError);
    return NextResponse.json({ error: "Could not delete the account" }, { status: 500 });
  }

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
