import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST() {
  const supabase = await createClient()

  // The id comes from the session cookie, never from the request body, so a
  // caller can only ever delete themselves.
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Account deletion is not configured on this server" }, { status: 500 })
  }

  // Deleting the auth user removes their assignments too: assignments.user_id
  // references auth.users(id) ON DELETE CASCADE.
  const { error: deleteError } = await createAdminClient().auth.admin.deleteUser(data.user.id)

  if (deleteError) {
    console.error("Account deletion failed:", deleteError)
    return NextResponse.json({ error: "Could not delete the account" }, { status: 500 })
  }

  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
