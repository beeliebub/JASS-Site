"use client";

import { useState } from "react";

type DiagnosticResponse = {
  data?: {
    status: { online: boolean; players: number; maxPlayers: number; motd: string };
    classification: string;
    error: string | null;
  };
  error?: { message?: string };
};

const FAILURE_LABELS: Record<string, string> = {
  unreachable: "unreachable",
  "timed-out": "timed out",
  refused: "connection refused",
  "bad-protocol-response": "unexpected protocol response",
  unknown: "unknown error",
};

export function ServerStatusTest({
  host,
  port,
  disabled,
}: {
  host: string | null | undefined;
  port: number | null | undefined;
  disabled?: boolean;
}) {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function testConnection() {
    const trimmedHost = host?.trim();
    if (!trimmedHost || !port) {
      setMessage("Enter a host and port first.");
      return;
    }

    setTesting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/server-status/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: trimmedHost, port }),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as DiagnosticResponse | null;
      if (!response.ok || !body?.data) {
        setMessage(body?.error?.message ?? "Connection test failed.");
        return;
      }

      if (body.data.status.online) {
        setMessage(`Online — ${body.data.status.players}/${body.data.status.maxPlayers} players.`);
      } else if (body.data.error) {
        const label = FAILURE_LABELS[body.data.classification.replaceAll("_", "-")] ?? body.data.classification;
        setMessage(`Offline — ${label}: ${body.data.error}`);
      } else {
        setMessage("Offline.");
      }
    } catch {
      setMessage("Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void testConnection()}
        disabled={disabled || testing}
        className="h-8 rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {testing ? "Testing…" : "Test connection"}
      </button>
      {message && (
        <span role="status" className="max-w-full text-xs text-muted">
          {message}
        </span>
      )}
    </div>
  );
}
