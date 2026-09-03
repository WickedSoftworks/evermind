import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { SettingsContent } from "@/components/settings-content";
import { TimeZoneProvider } from "@/components/timezone-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getTimeZone } from "@/lib/timezone-server";

export const dynamic = "force-dynamic";

function SettingsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full" />
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div>
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={data.user} />
      <main className="w-full py-6 px-6 md:px-10 lg:px-16">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <Suspense fallback={<SettingsLoading />}>
            <TimeZoneProvider initialTimeZone={await getTimeZone()}>
              <SettingsContent user={data.user} />
            </TimeZoneProvider>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
