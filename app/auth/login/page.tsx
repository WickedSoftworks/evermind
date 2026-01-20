"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useState } from "react"
import { BookOpen } from "lucide-react"
import GoogleIcon from "@/components/icons/GoogleIcon"
import Link from "next/link"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const currentUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const redirectUrl = currentUrl.includes('localhost') 
        ? 'http://localhost:3000/auth/callback'
        : 'https://evermind.shxrk.dev/auth/callback'

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
        },
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-primary">
              <BookOpen className="h-8 w-8" />
              <span className="text-2xl font-bold">Evermind</span>
            </div>
            <p className="text-sm text-muted-foreground">Never miss a deadline again</p>
          </div>
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>Sign in with your Google account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {error && <p className="text-sm text-destructive text-center">{error}</p>}
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                >
                  <GoogleIcon />
                  {isLoading ? "Signing in..." : "Continue with Google"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">Track your assignments and never miss a deadline</p>
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
