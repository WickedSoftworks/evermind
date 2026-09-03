"use client";

import Link from "next/link";
import { toast } from "@/hooks/use-toast";

export default function PrivacyPage() {
  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText("data@evermind.today");
    toast({ title: "Email copied to clipboard!" });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Privacy Policy</h1>

      <div className="space-y-6 text-gray-700 dark:text-gray-300">
        <section>
          <h2 className="text-2xl font-semibold mb-3">Introduction</h2>
          <p>
            This Privacy Policy describes how Evermind collects, uses, and protects your personal information when you
            use our service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Information We Collect</h2>
          <p className="mb-2">We collect information that you provide directly to us, including:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Account information (email address, name)</li>
            <li>Assignment and task data</li>
            <li>Usage information and preferences</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">How We Use Your Information</h2>
          <p className="mb-2">We use the information we collect to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Provide, maintain, and improve our services</li>
            <li>Process and complete transactions</li>
            <li>Send you technical notices and support messages</li>
            <li>Respond to your comments and questions</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal information against
            unauthorized access, alteration, disclosure, or destruction.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Data Handling</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share your information
            with trusted service providers who assist us in operating our website, conducting our business, or serving
            you.
            <br></br>
            <br></br>
            You can export or delete your data yourself at any time from your{" "}
            <Link href="/settings" className="underline decoration-solid hover:opacity-70 transition-opacity">
              settings page
            </Link>
            . For anything else, contact us at{" "}
            <button
              type="button"
              onClick={handleCopyEmail}
              className="underline decoration-solid cursor-pointer hover:opacity-70 transition-opacity"
            >
              data [at] evermind (dot) today
            </button>
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Third-Party Services</h2>
          <p>
            We use third-party services for authentication and data storage. These services have their own privacy
            policies governing the use of your information.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Your Rights</h2>
          <p className="mb-2">You have the right to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Access and receive a copy of your personal data</li>
            <li>Request correction of your personal data</li>
            <li>Request deletion of your personal data</li>
            <li>Object to processing of your personal data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
            Privacy Policy on this page.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at{" "}
            <button
              type="button"
              onClick={handleCopyEmail}
              className="underline decoration-solid cursor-pointer hover:opacity-70 transition-opacity"
            >
              data [at] evermind (dot) today
            </button>
          </p>
        </section>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-8">Last updated: March 3, 2026</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Evermind is not affiliated with any educational institution. We are an independent service provider.
        </p>
      </div>

      <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link href="/auth/login" className="hover:text-foreground underline-offset-4 hover:underline">
            Login
          </Link>
          <span className="hidden sm:inline">·</span>
          <Link href="/preview" className="hover:text-foreground underline-offset-4 hover:underline">
            Preview
          </Link>
        </div>
      </footer>
    </div>
  );
}
