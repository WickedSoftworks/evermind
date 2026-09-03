import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type React from "react";
import { Suspense } from "react";
import { ColorThemeProvider, colorThemeScript } from "@/components/color-theme-provider";
import { CompactModeProvider, compactModeScript } from "@/components/compact-mode-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Evermind - Assignment Tracker",
  description: "Never miss a deadline again. Track your assignments and stay on top of your coursework.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* These run before paint to stop a flash of the wrong theme. Both strings are
            built in this repo from a fixed set of theme ids - no user input reaches them. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, locally-authored FOUC script */}
        <script dangerouslySetInnerHTML={{ __html: compactModeScript }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, locally-authored FOUC script */}
        <script dangerouslySetInnerHTML={{ __html: colorThemeScript }} />
      </head>
      <body className={`font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <CompactModeProvider>
            <ColorThemeProvider>
              {children}
              <Suspense fallback={null}>
                <Toaster />
              </Suspense>
            </ColorThemeProvider>
          </CompactModeProvider>
        </ThemeProvider>
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
