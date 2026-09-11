import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { MoreCapabilities } from "@/components/settings/more-capabilities";
import { RetentionCard } from "@/components/settings/retention-card";
import { SettingsContent } from "@/components/settings-content";
import { TimeZoneProvider } from "@/components/timezone-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { readRetentionPolicy } from "@/lib/data/retention";
import { capabilities, proSection } from "@/lib/pro";
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

  // Supplied only by the optional module, and rendered here rather than inside
  // `SettingsContent` because whether it exists is a fact about this build,
  // which is a server question. Undefined in every build without that module,
  // and the settings page is simply one card shorter.
  const ApiTokens = proSection("settings-api-tokens");

  // Every build removes completed assignments on some schedule, so this card is
  // always drawn — the module supplies an editable version of it, and without
  // the module the plain statement of the policy is what remains. Not an
  // upgrade prompt with the controls greyed out: a build with nothing to sell
  // has nothing to grey out.
  const Retention = proSection("settings-retention");

  // The kind of account, for the profile menu. Same shape as the panels above:
  // a build without the module has one kind of account and draws nothing.
  const AccountType = proSection("header-account-type");

  // What this account cannot use, and whatever the module offered to say about
  // it. `NO_CAPABILITIES` everywhere else, which draws nothing at all.
  const available = await capabilities(data.user.id);

  return (
    <div className="min-h-screen bg-background">
      <Header user={data.user} accountType={AccountType ? <AccountType /> : null} />
      <main className="w-full py-6 px-6 md:px-10 lg:px-16">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <Suspense fallback={<SettingsLoading />}>
            <TimeZoneProvider initialTimeZone={await getTimeZone()}>
              <SettingsContent
                user={data.user}
                extraGeneralPanel={
                  <>
                    {ApiTokens ? <ApiTokens /> : null}
                    <MoreCapabilities capabilities={available} />
                  </>
                }
                retentionPanel={
                  Retention ? (
                    <Retention />
                  ) : (
                    <RetentionCard policy={await readRetentionPolicy(supabase, data.user.id)} />
                  )
                }
              />
            </TimeZoneProvider>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
