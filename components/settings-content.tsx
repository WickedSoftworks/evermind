"use client";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { AppearanceTab } from "@/components/settings/appearance-tab";
import { CanvasImport } from "@/components/settings/canvas-import";
import { ClassesManager } from "@/components/settings/classes-manager";
import { GeneralTab } from "@/components/settings/general-tab";
import { GoogleClassroomCard } from "@/components/settings/google-classroom-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Settings — the tab shell, and nothing else.
 *
 * This was a single 1100-line component holding the account panel, the class
 * manager, the Canvas importer, the Google Classroom placeholder and the whole
 * theme editor, with around twenty pieces of state between them and no boundary
 * anywhere. Each panel is now its own file owning its own state, so a change to
 * one cannot reach the others.
 */

const TABS = ["general", "assignments", "appearance"] as const;
type SettingsTab = (typeof TABS)[number];

function asTab(value: string | null): SettingsTab {
  return (TABS as readonly string[]).includes(value ?? "") ? (value as SettingsTab) : "general";
}

interface SettingsContentProps {
  user: SupabaseUser;
  /**
   * Optional panels, already rendered by the server page and passed down as a
   * node. There may be more than one, or none.
   *
   * It arrives this way round because deciding whether it exists is a server
   * question — it depends on which modules are compiled into this build — and
   * this component runs in the browser. `null` is the ordinary case and draws
   * nothing: not a disabled card, not a placeholder. See `lib/pro/contract.ts`.
   */
  extraGeneralPanel?: ReactNode;
  /**
   * What happens to completed assignments, as a rendered card.
   *
   * Same reasoning as above and one difference: this one is never null. Every
   * build removes completed work on some schedule, so every build owes the user
   * a page that says so — what varies is only whether the card can be edited,
   * and that is decided on the server.
   */
  retentionPanel: ReactNode;
}

export function SettingsContent({ user, extraGeneralPanel, retentionPanel }: SettingsContentProps) {
  const searchParams = useSearchParams();

  return (
    <Tabs defaultValue={asTab(searchParams.get("tab"))} className="w-full">
      <TabsList aria-label="Settings sections" className="w-full">
        <TabsTrigger value="general" className="flex-1">
          General
        </TabsTrigger>
        <TabsTrigger value="assignments" className="flex-1">
          Assignments
        </TabsTrigger>
        <TabsTrigger value="appearance" className="flex-1">
          Appearance
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="mt-6 space-y-6">
        <GeneralTab user={user} />
        {extraGeneralPanel}
      </TabsContent>

      <TabsContent value="assignments" className="mt-6 space-y-6">
        <ClassesManager userId={user.id} />
        {retentionPanel}
        <GoogleClassroomCard />
        <CanvasImport />
      </TabsContent>

      <TabsContent value="appearance" className="mt-6 space-y-6">
        <AppearanceTab />
      </TabsContent>

      <p className="mt-10 text-center text-sm text-muted-foreground/70">Tip: Click on the Evermind logo to go home!</p>
    </Tabs>
  );
}
