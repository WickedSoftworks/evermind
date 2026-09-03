import { NextResponse } from "next/server";
import { zonedDayKey } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getTimeZone } from "@/lib/timezone-server";
import type { Assignment } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Supabase caps a single select at 1000 rows, so pull the table a page at a time. */
const PAGE_SIZE = 1000;

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

export async function GET() {
  const supabase = await createClient();

  // The id comes from the session cookie, never from the request, so a caller
  // can only ever export themselves.
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
