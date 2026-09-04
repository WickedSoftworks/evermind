"use client";

import { BookOpen, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  /** Re-renders the failed segment. Enough to recover from a transient fetch failure. */
  reset: () => void;
}

/**
 * Catches anything a page or component below the root layout throws.
 *
 * Without this file the user sees Next.js's own screen: a red overlay in
 * development, and in production the bare line "Application error: a
 * client-side exception has occurred" on a blank page, with no way back.
 */
export default function RouteError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // next.config.mjs deliberately keeps console output in production, so this
    // is still readable in the browser console on the deployed site.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 text-primary transition-opacity hover:opacity-80"
          >
            <BookOpen className="h-8 w-8" />
            <span className="text-2xl font-bold">Evermind</span>
          </Link>
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <CardDescription>
                This page failed to load. Nothing was saved or deleted — trying again is safe.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Try again
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Take me home</Link>
              </Button>
              {/* Production strips the real message off server errors but keeps the
                  digest, which is what matches this crash to a line in the logs. */}
              {error.digest && (
                <p className="text-center font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>
              )}
              {process.env.NODE_ENV === "development" && error.message && (
                <p className="break-words text-center font-mono text-xs text-destructive">{error.message}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
