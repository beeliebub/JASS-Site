import { status as pingJavaServer } from "minecraft-server-util";

/**
 * Live Minecraft server status, per the `GET /api/status` route (Phase 5 of
 * PLAN.md). `motd` is included for future use even though the current home
 * hero badge only renders online/offline + player count.
 */
export type McStatus = {
  online: boolean;
  players: number;
  maxPlayers: number;
  motd: string;
};

const OFFLINE_STATUS: McStatus = { online: false, players: 0, maxPlayers: 0, motd: "" };

// In-memory cache: single-process/SQLite-scale app, so a module-level
// variable is enough to avoid hammering the Minecraft server with a full
// status ping on every page load / client poll tick.
const CACHE_TTL_MS = 30_000;
const PING_TIMEOUT_MS = 5_000;

let cached: { value: McStatus; expiresAt: number } | null = null;
// Concurrent callers during a cache miss share one in-flight ping instead of
// each firing their own request at the server.
let inFlight: Promise<McStatus> | null = null;

async function pingServer(): Promise<McStatus> {
  const host = process.env.MC_SERVER_HOST;
  const port = process.env.MC_SERVER_PORT ? Number(process.env.MC_SERVER_PORT) : undefined;

  if (!host) {
    console.error("MC_SERVER_HOST is not set; reporting the server as offline.");
    return OFFLINE_STATUS;
  }

  try {
    const response = await pingJavaServer(host, port, {
      timeout: PING_TIMEOUT_MS,
      enableSRV: true,
    });

    return {
      online: true,
      players: response.players.online,
      maxPlayers: response.players.max,
      motd: response.motd.clean,
    };
  } catch (error) {
    // Timeouts, DNS failures, connection refused, etc. all land here --
    // never let a ping failure propagate and crash the route/page.
    console.error("Minecraft server ping failed:", error);
    return OFFLINE_STATUS;
  }
}

/**
 * Returns the live Minecraft server status, served from an in-memory cache
 * for up to `CACHE_TTL_MS`. Never throws -- a failed ping resolves to an
 * "offline" status rather than rejecting.
 */
export async function getServerStatus(): Promise<McStatus> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (!inFlight) {
    inFlight = pingServer().finally(() => {
      inFlight = null;
    });
  }

  const value = await inFlight;
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
