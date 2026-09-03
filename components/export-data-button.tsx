"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Prefers the filename the route already dated in the user's timezone. */
function filenameFrom(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match ? match[1] : "evermind-export.json";
}

export function ExportDataButton() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch("/api/account/export");

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Could not export your data. Please try again.");
        return;
      }

      // Going through a blob rather than linking straight at the route keeps
      // the failure cases above on this page instead of navigating the user to
      // a tab full of raw JSON.
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(response.headers.get("Content-Disposition"));
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={handleExport} disabled={isExporting}>
        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Export my data
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
