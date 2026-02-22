"use client";

import { useState } from "react";

interface SyncButtonProps {
  year: string;
  onCompleted?: () => void;
}

export function SyncButton({ year, onCompleted }: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runSync() {
    setIsSyncing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ year }),
      });

      const body = (await response.json()) as { pulled?: number; failed?: number; error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Sync failed");
      }

      setMessage(`Updated ${body.pulled ?? 0} bills${body.failed ? ` (${body.failed} failed)` : ""}.`);
      onCompleted?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to refresh data");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={runSync} disabled={isSyncing}>
        {isSyncing ? "Refreshing session data..." : "Refresh From IGA"}
      </button>
      {message ? <div className="small-muted" style={{ marginTop: "0.4rem" }}>{message}</div> : null}
    </div>
  );
}
