import { status as pingJavaServer } from "minecraft-server-util";

/**
 * Live Minecraft server status, per the `GET /api/status` route (and, for
 * arbitrary targets, `POST /api/server-status`).
 * `motd` is included for future use even though the current home
 * hero badge only renders online/offline + player count.
 */
export type McStatus = {
  online: boolean;
  players: number;
  maxPlayers: number;
  motd: string;
};

export const OFFLINE_STATUS: McStatus = { online: false, players: 0, maxPlayers: 0, motd: "" };

export type PingFailureReason = "unreachable" | "timed-out" | "refused" | "bad-protocol-response" | "unknown";

export type PingFailure = {
  reason: PingFailureReason;
  message: string;
};

export type ServerStatusDiagnostic = {
  status: McStatus;
  failure: PingFailure | null;
};

// In-memory cache: single-process/SQLite-scale app, so a module-level
// Map is enough to avoid hammering each Minecraft server with a full status
// ping on every page load / client poll tick. Keyed by `host:port` so
// multiple independently-configured targets (main server, optional "Dig"
// server, etc. -- see components/blocks/server-status-block.tsx) each get
// their own cache slot instead of sharing one.
const CACHE_TTL_MS = 30_000;
const PING_TIMEOUT_MS = 5_000;

const cache = new Map<string, { value: McStatus; expiresAt: number }>();
// Concurrent callers during a cache miss (for the same key) share one
// in-flight ping instead of each firing their own request at the server.
const inFlight = new Map<string, Promise<McStatus>>();

type PingOptions = { enableSRV?: boolean };

function cacheKey(host: string, port: number | undefined, options: PingOptions) {
  return `${host}:${port}:${options.enableSRV === false ? "direct" : "srv"}`;
}

function classifyPingFailure(error: unknown): PingFailure {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message = (candidate?.message instanceof String ? candidate.message.toString() : typeof candidate?.message === "string" ? candidate.message : String(error)).slice(0, 500);
  const normalized = message.toLowerCase();

  if (code === "ETIMEDOUT" || normalized.includes("timed out") || normalized.includes("timeout")) {
    return { reason: "timed-out", message };
  }
  if (code === "ECONNREFUSED" || normalized.includes("connection refused")) {
    return { reason: "refused", message };
  }
  if (["ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) {
    return { reason: "unreachable", message };
  }
  if (normalized.includes("expected server") || normalized.includes("packet") || normalized.includes("json")) {
    return { reason: "bad-protocol-response", message };
  }
  return { reason: "unknown", message };
}

async function pingServerWithDiagnostic(
  host: string,
  port: number | undefined,
  options: PingOptions = {},
): Promise<ServerStatusDiagnostic> {
  try {
    const response = await pingJavaServer(host, port, {
      timeout: PING_TIMEOUT_MS,
      enableSRV: options.enableSRV ?? true,
    });

    return {
      status: {
        online: true,
        players: response.players.online,
        maxPlayers: response.players.max,
        motd: response.motd.clean,
      },
      failure: null,
    };
  } catch (error) {
    // Timeouts, DNS failures, connection refused, etc. all land here --
    // never let a ping failure propagate and crash the route/page.
    console.error(`Minecraft server ping failed for ${host}:${port ?? "(default)"}:`, error);
    return { status: OFFLINE_STATUS, failure: classifyPingFailure(error) };
  }
}

async function pingServer(host: string, port: number | undefined, options: PingOptions): Promise<McStatus> {
  return (await pingServerWithDiagnostic(host, port, options)).status;
}

/**
 * Returns the live Minecraft-Java-protocol status for an arbitrary
 * `{host, port}` target, served from an in-memory cache (per-target, keyed
 * by `host:port`) for up to `CACHE_TTL_MS`. Never throws -- a failed ping
 * resolves to an "offline" status rather than rejecting.
 */
export async function getServerStatusFor(target: { host: string; port?: number }, options: PingOptions = {}): Promise<McStatus> {
  const key = cacheKey(target.host, target.port, options);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = pingServer(target.host, target.port, options).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, pending);
  }

  const value = await pending;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Performs one uncached Java status ping for the admin connection tester. */
export async function testServerStatusFor(target: { host: string; port: number }): Promise<ServerStatusDiagnostic> {
  return pingServerWithDiagnostic(target.host, target.port);
}

/**
 * Convenience wrapper around `getServerStatusFor` for the original
 * single-server, env-var-configured target (`MC_SERVER_HOST`/
 * `MC_SERVER_PORT`) -- keeps `app/api/status/route.ts` (and the Hero
 * block's `LiveStatusBadge`) unchanged.
 */
export async function getServerStatus(): Promise<McStatus> {
  const host = process.env.MC_SERVER_HOST;
  const port = process.env.MC_SERVER_PORT ? Number(process.env.MC_SERVER_PORT) : undefined;

  if (!host) {
    console.error("MC_SERVER_HOST is not set; reporting the server as offline.");
    return OFFLINE_STATUS;
  }

  return getServerStatusFor({ host, port });
}
