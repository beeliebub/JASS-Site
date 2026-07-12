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

/**
 * Client wrapper around the presentational `StatusBadge`: fetches
 * `GET /api/status` on mount and re-polls on an interval so the badge
 * reflects reality (started/stopped server) without a reload. Any fetch
 * failure (network error, non-OK response, bad JSON) renders "offline"
 * rather than throwing -- this must never crash the home page.
 */
export function LiveStatusBadge() {
  const [status, setStatus] = useState<ServerStatus>(OFFLINE_STATUS);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const body = (await res.json()) as StatusApiBody;

        if (!res.ok || "error" in body) {
          if (!cancelled) setStatus(OFFLINE_STATUS);
          return;
        }

        if (!cancelled) setStatus(body.data);
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
  }, []);

  return <StatusBadge status={status} />;
}
