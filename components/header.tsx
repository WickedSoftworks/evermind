"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { BookOpen, LogOut, User, Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { ThemeToggle } from "@/components/theme-toggle"

interface HeaderProps {
  user: SupabaseUser
  isPreview?: boolean
}

export function Header({ user, isPreview = false }: HeaderProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    if (isPreview) {
      router.push("/auth/login")
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : "U"

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between px-6 md:px-10 lg:px-16">
        <Link href="/dashboard" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity cursor-pointer">
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
  )
}
