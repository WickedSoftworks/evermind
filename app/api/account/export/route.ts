import { NextResponse } from "next/server";
import { zonedDayKey } from "@/lib/dates";
import { clientAddress, rateLimit, tooManyRequests } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getTimeZone } from "@/lib/timezone-server";
import type { Assignment } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Supabase caps a single select at 1000 rows, so pull the table a page at a time. */
const PAGE_SIZE = 1000;

/**
 * An export reads the whole assignments table a page at a time, so it is the
 * most expensive thing a signed-in user can ask this server to do. Ten in ten
 * minutes is far more than anyone needs and well short of a loop.
 */
const PER_USER_LIMIT = 10;
const PER_USER_WINDOW_MS = 10 * 60 * 1000;

/** Coarse guard on the pre-session work; see the delete route for the reasoning. */
const PER_ADDRESS_LIMIT = 30;
const PER_ADDRESS_WINDOW_MS = 60 * 1000;

/**
 * A copy of everything the server holds about the signed-in user.
 *
 * `format` and `version` are here so the re-import half of this feature has a
 * stable thing to recognise later; bump `version` if the shape ever changes.
 */
interface AccountExport {
  format: "evermind.export";
  version: 1;
  exported_at: string;
  account: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
    provider: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
  };
  assignments: Assignment[];
}

export async function GET(request: Request) {
  // No same-origin check here, unlike the delete route. This is a GET that
  // changes nothing, and the same-origin policy already stops another site from
  // reading the response — a cross-site link would only download the file onto
  // the user's own machine. Demanding same-origin would break a bookmark and
  // buy nothing.
  const address = clientAddress(request);
  const byAddress = rateLimit(`account-export:addr:${address}`, PER_ADDRESS_LIMIT, PER_ADDRESS_WINDOW_MS);
  if (!byAddress.allowed) {
    return tooManyRequests(byAddress, "Too many requests. Please wait a moment and try again.");
  }

  const supabase = await createClient();

  // The id comes from the session cookie, never from the request, so a caller
  // can only ever export themselves.
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Keyed by user id rather than address, so one person on a shared network
  // cannot exhaust everyone else's budget.
  const byUser = rateLimit(`account-export:user:${data.user.id}`, PER_USER_LIMIT, PER_USER_WINDOW_MS);
  if (!byUser.allowed) {
    return tooManyRequests(byUser, "You have exported your data several times just now. Please wait a few minutes.");
  }

  const user = data.user;
  const assignments: Assignment[] = [];

  // An export that silently stops at row 1000 is worse than no export at all,
  // so keep asking until a page comes back short.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page, error: pageError } = await supabase
      .from("assignments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (pageError) {
      console.error("Data export failed:", pageError);
      return NextResponse.json({ error: "Could not read your assignments" }, { status: 500 });
    }

    assignments.push(...(page ?? []));

    if (!page || page.length < PAGE_SIZE) break;
  }

  const payload: AccountExport = {
    format: "evermind.export",
    version: 1,
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
      provider: user.app_metadata?.provider ?? null,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
    },
    assignments,
  };

  // Dated in the reader's own timezone, so a file saved late on the 3rd is not
  // named for the 4th.
  const filename = `evermind-export-${zonedDayKey(new Date(), await getTimeZone())}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // This is personal data; it must not land in a shared or browser cache.
      "Cache-Control": "no-store",
    },
  });
}
