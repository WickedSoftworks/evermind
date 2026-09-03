import { createClient } from "@/lib/supabase/server";
import type { Assignment } from "@/lib/types";

export interface DashboardData {
  assignments: Assignment[];
}

/**
 * Fetches all dashboard data in parallel using Promise.all
 * This runs on the server for faster initial page loads
 */
export async function fetchDashboardData(userId: string): Promise<DashboardData> {
  const supabase = await createClient();

  // Fetch all data in parallel using Promise.all
  const [assignmentsResult] = await Promise.all([
    supabase.from("assignments").select("*").eq("user_id", userId).order("due_date", { ascending: true }),
    // Add more parallel fetches here as the app grows:
    // supabase.from("categories").select("*").eq("user_id", userId),
    // supabase.from("settings").select("*").eq("user_id", userId),
  ]);

  return {
    assignments: assignmentsResult.data || [],
  };
}

/**
 * Fetches user authentication and dashboard data in parallel
 */
export async function fetchUserAndDashboardData() {
  const supabase = await createClient();

  // First get the user (required before we can fetch their data)
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return { user: null, dashboardData: null, error: userError };
  }

  // Now fetch dashboard data
  const dashboardData = await fetchDashboardData(userData.user.id);

  return {
    user: userData.user,
    dashboardData,
    error: null,
  };
}
