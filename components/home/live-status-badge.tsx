"use client";

import { useEffect, useState } from "react";
import { StatusBadge, type ServerStatus } from "@/components/home/status-badge";

// Client polling: ~30-60s so the badge stays fresh
// without a page reload. The server route itself caches the underlying
// Minecraft ping for ~30s, so polling faster than that wouldn't get fresher
// data anyway.
const POLL_INTERVAL_MS = 45_000;

const OFFLINE_STATUS: ServerStatus = { online: false, players: 0, maxPlayers: 0 };

type StatusApiBody = { data: ServerStatus } | { error: { code: string; message: string } };
type CustomStatusApiBody = { data: ServerStatus[] } | { error: { code: string; message: string } };

export type LiveStatusBadgeProps = {
  label?: string;
  host?: string;
  port?: number;
  useGlobalStatus?: boolean;
};

/**
 * Client wrapper around the presentational `StatusBadge`: polls the global
 * server through `GET /api/status`, or an explicitly configured target
 * through the shared multi-server endpoint. Any fetch failure (network
 * error, non-OK response, bad JSON) renders "offline" rather than throwing.
 */
export function LiveStatusBadge({ label, host, port, useGlobalStatus }: LiveStatusBadgeProps = {}) {
  const [status, setStatus] = useState<ServerStatus>(OFFLINE_STATUS);
  const useCustomTarget = !useGlobalStatus && Boolean(host && port);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = useCustomTarget
          ? await fetch("/api/server-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ servers: [{ host, port }] }),
              cache: "no-store",
            })
          : await fetch("/api/status", { cache: "no-store" });
        const body = (await res.json()) as StatusApiBody | CustomStatusApiBody;

        if (!res.ok || "error" in body) {
          if (!cancelled) setStatus(OFFLINE_STATUS);
          return;
        }

        const nextStatus = Array.isArray(body.data) ? body.data[0] : body.data;
        if (!cancelled) setStatus(nextStatus ?? OFFLINE_STATUS);
      } catch {
        // Network error, timeout, etc. -- fall back to "offline" quietly.
        if (!cancelled) setStatus(OFFLINE_STATUS);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [host, port, useCustomTarget]);

  return <StatusBadge status={status} label={label} />;
}
