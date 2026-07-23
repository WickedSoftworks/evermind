import { createClient } from "@supabase/supabase-js"

/**
 * Service-role client. Bypasses Row Level Security entirely, so it must only
 * ever be constructed in server-side code — never in a "use client" module.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
