import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export const dynamic = 'force-dynamic'

export default async function Home() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      console.error("Auth error:", error)
      redirect("/preview")
    }

    if (data?.user) {
      redirect("/dashboard")
    } else {
      redirect("/preview")
    }
  } catch (error) {
    console.error("Page error:", error)
    redirect("/preview")
  }
}
