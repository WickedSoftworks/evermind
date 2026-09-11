"use client";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { BookOpen, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

interface HeaderProps {
  user: SupabaseUser;
  isPreview?: boolean;
  /**
   * What kind of account this is, already rendered by the server page.
   *
   * Null in every build without the optional module, and then nothing is drawn
   * — not the label, not the separator. A self-hosted instance has one kind of
   * account, so a menu row announcing which kind you have would be answering a
   * question nobody on it can ask.
   *
   * A node rather than a string because the wording belongs to whatever decides
   * it, and because working out the answer means reading the session and a
   * table — a server question, in a component that runs in the browser.
   */
  accountType?: ReactNode;
}

export function Header({ user, isPreview = false, accountType = null }: HeaderProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    if (isPreview) {
      router.push("/auth/login");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : "U";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between px-6 md:px-10 lg:px-16">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity cursor-pointer"
        >
          <BookOpen className="h-6 w-6" />
          <span className="text-xl font-bold">Evermind</span>
          {isPreview && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Preview
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings">
              <Settings className="h-[1.2rem] w-[1.2rem]" />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
          {isPreview ? (
            <Button asChild size="sm">
              <Link href="/auth/login">Sign in to save</Link>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full cursor-pointer">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user.user_metadata?.avatar_url || "/placeholder.svg"}
                      alt={user.email || "User"}
                    />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* A label rather than an item: it says what this account is, and
                    there is nothing to do about it here. Making it focusable
                    would put a dead stop in the menu's keyboard order. */}
                {accountType ? (
                  <>
                    <DropdownMenuLabel className="font-normal">{accountType}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem asChild className="flex items-center gap-2 cursor-pointer">
                  <Link href="/settings?tab=general">
                    <User className="h-4 w-4" />
                    <span className="text-sm truncate max-w-[200px]">{user.email}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
