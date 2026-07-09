/**
 * Server status badge -- purely presentational. Phase 5 wired the real data
 * source: `components/home/live-status-badge.tsx` polls `GET /api/status`
 * (live Server List Ping, server-cached ~30s) and passes the result in here
 * as `status`. `stubStatus` remains as the default fallback for any other
 * caller that doesn't have live data on hand.
 */
export type ServerStatus = {
  online: boolean;
  players: number;
  maxPlayers: number;
  /** MOTD from the ping response. Not rendered yet -- carried for future use. */
  motd?: string;
};

const stubStatus: ServerStatus = {
  online: true,
  players: 24,
  maxPlayers: 100,
};

export function StatusBadge({ status = stubStatus }: { status?: ServerStatus }) {
  return (
    <div
      className="inline-flex h-9 items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 text-sm"
      role="status"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {status.online && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-online opacity-75 motion-safe:animate-ping" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            status.online ? "bg-online" : "bg-offline"
          }`}
        />
      </span>
      <span className="font-medium text-foreground">
        {status.online ? "Online" : "Offline"}
      </span>
      {status.online && (
        <>
          <span aria-hidden className="text-border-strong">
            &middot;
          </span>
          <span className="font-mono text-muted">
            {status.players}/{status.maxPlayers}
          </span>
        </>
      )}
    </div>
  );
}
