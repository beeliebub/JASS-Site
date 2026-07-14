"use client";

import { useEffect, useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { StatusBadge, type ServerStatus } from "@/components/home/status-badge";

/**
 * One configured server, stored as plain JSON on `Block.data.servers`
 * (`serverStatusDataSchema` in lib/validation/pages.ts) -- same
 * "each block instance owns its own config" convention as `postDisplay`'s
 * `tagIds`, not a shared table.
 *
 * `protocol: "minecraft-java"` entries are pinged live (via
 * `getServerStatusFor` in lib/mc-status.ts, through `POST /api/server-status`)
 * using `host`/`port`. `protocol: "manual"` entries have no real ping path --
 * there's no confirmed Hytale status-query protocol/library in this stack
 * today (`minecraft-server-util`, already a dependency, is
 * Minecraft-Java-specific) -- so an admin toggles `manualOnline` and sets
 * `manualPlayers`/`manualMaxPlayers` by hand instead; visitors just see
 * whatever was last saved, no fetch involved. This is the intended path for
 * the Hytale entry, and works equally well for any other server with no live
 * ping support.
 */
export type ServerStatusEntry = {
  label: string;
  protocol: "minecraft-java" | "manual";
  host?: string | null;
  port?: number | null;
  manualOnline?: boolean;
  manualPlayers?: number;
  manualMaxPlayers?: number;
};

export type ServerStatusData = { servers: ServerStatusEntry[] };

const MAX_SERVERS = 5;

// Same polling cadence as components/home/live-status-badge.tsx -- the
// server route caches each underlying Minecraft ping ~30s server-side, so
// polling faster than that wouldn't get fresher data anyway.
const POLL_INTERVAL_MS = 45_000;

const OFFLINE_STATUS: ServerStatus = { online: false, players: 0, maxPlayers: 0 };

type ServerStatusApiBody = { data: ServerStatus[] } | { error: { code: string; message: string } };

function manualStatus(entry: ServerStatusEntry): ServerStatus {
  return {
    online: entry.manualOnline ?? false,
    players: entry.manualPlayers ?? 0,
    maxPlayers: entry.manualMaxPlayers ?? 0,
  };
}

/**
 * Live status for a batch of Minecraft-Java targets, fetched via a single
 * `POST /api/server-status` call and re-polled on an interval -- the
 * multi-target generalization of `live-status-badge.tsx`'s single-target
 * `GET /api/status` polling. Any fetch failure (network error, non-OK
 * response, bad JSON) falls back to "offline" for every target rather than
 * throwing -- this must never crash the page.
 */
function useLiveStatuses(targets: { host: string; port: number }[]): ServerStatus[] {
  // Targets is a fresh array literal every render (built inline by the
  // caller); stringify it into a stable key so the effect only re-fetches
  // when the actual host/port list changes, not on every render.
  const targetsKey = JSON.stringify(targets);
  const [statuses, setStatuses] = useState<ServerStatus[]>(() => targets.map(() => OFFLINE_STATUS));

  useEffect(() => {
    const parsedTargets = JSON.parse(targetsKey) as { host: string; port: number }[];

    // Nothing to poll -- the `targets.length === 0` ternary below already
    // returns `[]` in that case without needing to set state here.
    if (parsedTargets.length === 0) return;

    let cancelled = false;

    async function fetchStatuses() {
      try {
        const res = await fetch("/api/server-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ servers: parsedTargets }),
          cache: "no-store",
        });
        const body = (await res.json()) as ServerStatusApiBody;

        if (!res.ok || "error" in body) {
          if (!cancelled) setStatuses(parsedTargets.map(() => OFFLINE_STATUS));
          return;
        }

        if (!cancelled) setStatuses(body.data);
      } catch {
        // Network error, timeout, etc. -- fall back to "offline" quietly.
        if (!cancelled) setStatuses(parsedTargets.map(() => OFFLINE_STATUS));
      }
    }

    fetchStatuses();
    const interval = setInterval(fetchStatuses, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [targetsKey]);

  return targets.length === 0 ? [] : statuses;
}

function ServerStatusRow({ label, status }: { label: string; status: ServerStatus }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <StatusBadge status={status} />
    </div>
  );
}

/** Visitor-facing render: one row per configured server, in order. Only
 * "minecraft-java" entries with both `host` and `port` set go into the live
 * batch-ping request; "manual" entries (and any not-yet-configured
 * "minecraft-java" entry) render straight from stored data. */
function ServerStatusVisitorView({ servers }: { servers: ServerStatusEntry[] }) {
  const javaEntries = servers
    .map((server, index) => ({ server, index }))
    .filter((entry): entry is { server: ServerStatusEntry & { host: string; port: number }; index: number } =>
      Boolean(entry.server.protocol === "minecraft-java" && entry.server.host && entry.server.port),
    );

  const liveStatuses = useLiveStatuses(
    javaEntries.map(({ server }) => ({ host: server.host, port: server.port })),
  );

  const liveStatusByIndex = new Map<number, ServerStatus>();
  javaEntries.forEach(({ index }, i) => liveStatusByIndex.set(index, liveStatuses[i] ?? OFFLINE_STATUS));

  return (
    <div className="flex flex-col gap-2">
      {servers.map((server, index) => (
        <ServerStatusRow
          key={index}
          label={server.label}
          status={server.protocol === "manual" ? manualStatus(server) : liveStatusByIndex.get(index) ?? OFFLINE_STATUS}
        />
      ))}
    </div>
  );
}

const PROTOCOL_LABELS: Record<ServerStatusEntry["protocol"], string> = {
  "minecraft-java": "Minecraft (Java)",
  manual: "Manual",
};

function ProtocolSelect({
  value,
  onChange,
  disabled,
  index,
}: {
  value: ServerStatusEntry["protocol"];
  onChange: (next: ServerStatusEntry["protocol"]) => void;
  disabled?: boolean;
  index: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
      Protocol
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ServerStatusEntry["protocol"])}
        disabled={disabled}
        aria-label={`Server ${index + 1} protocol`}
        className="h-8 w-40 rounded-md border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
      >
        {(Object.keys(PROTOCOL_LABELS) as ServerStatusEntry["protocol"][]).map((protocol) => (
          <option key={protocol} value={protocol}>
            {PROTOCOL_LABELS[protocol]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Draft-then-commit-on-blur numeric field -- same pattern as
 * ImageBlock/LinkGridBlock's scale/width/height inputs, so a keystroke
 * doesn't trigger a save on every character. `null` from `onCommit` means
 * "cleared" (only meaningful for nullable fields like `port`; callers of
 * this field for non-nullable fields like `manualPlayers` translate `null`
 * to a default themselves). */
function DraftNumberField({
  label,
  value,
  min,
  max,
  disabled,
  ariaLabel,
  onCommit,
}: {
  label: string;
  value: number | null | undefined;
  min: number;
  max: number;
  disabled?: boolean;
  ariaLabel: string;
  onCommit: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  function commit() {
    const raw = draft.trim();
    if (raw === "") {
      onCommit(null);
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setDraft(value != null ? String(value) : "");
      return;
    }
    const clamped = Math.min(Math.max(parsed, min), max);
    setDraft(String(clamped));
    onCommit(clamped);
  }

  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        className="h-8 w-24 rounded-md border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
      />
    </label>
  );
}

function ServerEntryEditor({
  entry,
  index,
  disabled,
  onPatch,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  entry: ServerStatusEntry;
  index: number;
  disabled: boolean;
  onPatch: (patch: Partial<ServerStatusEntry>) => Promise<void>;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface p-4">
      <div className="min-w-0 flex-1">
        <EditableText
          as="span"
          value={entry.label}
          onSave={(v) => onPatch({ label: v })}
          label={`server ${index + 1} label`}
          className="block text-sm font-semibold text-foreground"
        />
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <ProtocolSelect
            index={index}
            value={entry.protocol}
            disabled={disabled}
            onChange={(protocol) => onPatch({ protocol })}
          />
          {entry.protocol === "minecraft-java" ? (
            <>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                Host
                <EditableText
                  as="span"
                  value={entry.host ?? ""}
                  onSave={(v) => onPatch({ host: v })}
                  label={`server ${index + 1} host`}
                  allowEmpty
                  placeholder="mc.example.net"
                  className="block font-mono text-xs text-foreground"
                />
              </label>
              <DraftNumberField
                label="Port"
                value={entry.port}
                min={1}
                max={65535}
                disabled={disabled}
                ariaLabel={`Server ${index + 1} port`}
                onCommit={(next) => onPatch({ port: next })}
              />
            </>
          ) : (
            <>
              <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={entry.manualOnline ?? false}
                  onChange={(e) => onPatch({ manualOnline: e.target.checked })}
                  disabled={disabled}
                  aria-label={`Server ${index + 1} online`}
                />
                Online
              </label>
              <DraftNumberField
                label="Players"
                value={entry.manualPlayers}
                min={0}
                max={100000}
                disabled={disabled}
                ariaLabel={`Server ${index + 1} player count`}
                onCommit={(next) => onPatch({ manualPlayers: next ?? 0 })}
              />
              <DraftNumberField
                label="Max players"
                value={entry.manualMaxPlayers}
                min={0}
                max={100000}
                disabled={disabled}
                ariaLabel={`Server ${index + 1} max player count`}
                onCommit={(next) => onPatch({ manualMaxPlayers: next ?? 0 })}
              />
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <MoveUpButton disabled={!canMoveUp || disabled} onClick={onMoveUp} />
        <MoveDownButton disabled={!canMoveDown || disabled} onClick={onMoveDown} />
        <DeleteButton label="Delete server" onClick={onDelete} disabled={disabled} />
      </div>
    </div>
  );
}

/** Server Status block: shows live/manual online status for one or more
 * servers (main Minecraft server, an optional second Minecraft server, a
 * manually-toggled Hytale entry, etc.), each configured independently on
 * this block instance -- see `ServerStatusEntry` above. Admin edit mode adds
 * a form for adding/editing/removing/reordering entries
 * (`MoveUpButton`/`MoveDownButton` from list-controls.tsx, same convention
 * as accordion/link-grid); visitor mode (and non-edit-mode admin view) shows
 * only the read-only status rows. */
export function ServerStatusBlock({
  data,
  onSaveData,
}: {
  data: ServerStatusData;
  onSaveData: (next: ServerStatusData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [servers, setServers] = useState<ServerStatusEntry[]>(data.servers);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;

  if (!showEditable) {
    return (
      <Container className="py-8 sm:py-10">
        <ServerStatusVisitorView servers={servers} />
      </Container>
    );
  }

  async function persist(next: ServerStatusEntry[]) {
    const previous = servers;
    setServers(next);
    setSaving(true);
    try {
      await onSaveData({ servers: next });
    } catch (error) {
      setServers(previous);
      showError(error instanceof Error ? error.message : "Failed to save server list.");
    } finally {
      setSaving(false);
    }
  }

  function patchEntry(index: number, patch: Partial<ServerStatusEntry>) {
    return persist(servers.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  function addEntry() {
    return persist([...servers, { label: "New server", protocol: "minecraft-java", host: "", port: 25565 }]);
  }

  function deleteEntry(index: number) {
    return persist(servers.filter((_, i) => i !== index));
  }

  function moveEntry(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= servers.length) return Promise.resolve();
    const next = [...servers];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    return persist(next);
  }

  return (
    <Container className="py-8 sm:py-10">
      <div className="flex flex-col gap-3">
        {servers.length === 0 && <p className="text-sm text-muted">Add at least one server to show its status here.</p>}
        {servers.map((entry, i) => (
          <ServerEntryEditor
            key={i}
            entry={entry}
            index={i}
            disabled={saving}
            onPatch={(patch) => patchEntry(i, patch)}
            onDelete={() => deleteEntry(i)}
            onMoveUp={() => moveEntry(i, -1)}
            onMoveDown={() => moveEntry(i, 1)}
            canMoveUp={i > 0}
            canMoveDown={i < servers.length - 1}
          />
        ))}
        <AddButton onClick={addEntry} disabled={saving || servers.length >= MAX_SERVERS} className="self-start">
          Add server
        </AddButton>
      </div>
    </Container>
  );
}
