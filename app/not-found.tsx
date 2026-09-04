import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Page not found - Evermind",
};

/**
 * Shown for any URL that matches no route, and wherever `notFound()` is called.
 *
 * Without this file Next.js serves its own bare black-and-white 404, which
 * looks nothing like the app and offers no way back into it.
 *
 * "/" is the destination rather than "/dashboard" because it already redirects
 * by auth state, so this works for a signed-out visitor too.
 */
export default function NotFound() {
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
              <CardTitle className="text-xl">404 — Page not found</CardTitle>
              <CardDescription>
                That link is broken or the page has moved. Your assignments are untouched.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/">Take me home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
