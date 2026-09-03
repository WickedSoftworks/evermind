import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The proxy redirects "/" before this renders; this is only a fallback.
export default async function Home() {
  let isAuthenticated = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error("Auth error:", error);
    } else {
      isAuthenticated = Boolean(data?.user);
    }
  } catch (error) {
    console.error("Page error:", error);
  }

  redirect(isAuthenticated ? "/dashboard" : "/preview");
}
