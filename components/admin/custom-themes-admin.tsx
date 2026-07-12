"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { HexColorPicker } from "react-colorful";
import type { CustomTheme } from "@/app/generated/prisma/client";
import { useToast } from "@/components/admin/toast";
import { DeleteButton, AddButton } from "@/components/admin/list-controls";
import { parseHex, readableForeground, rgbToHex } from "@/lib/color";
import { CUSTOM_THEME_TOKEN_FIELDS, customThemeFieldsToCssVars, type CustomThemeTokenField } from "@/lib/themes";

/**
 * Admin editor for custom themes. Mirrors components/admin/pages-admin.tsx's
 * conventions: local `useState` list, optimistic-update-then-revert on delete,
 * `useToast()` for feedback, and a `parseError`-shaped helper reading `body.error`.
 * The create/edit form reuses lib/color.ts's `parseHex`/`rgbToHex` (hex<->picker
 * sync) and `readableForeground` (a lightweight per-swatch legibility hint) --
 * same validated color math as components/theme/theme-picker.tsx's single-accent
 * control, just repeated across all 16 tokens.
 */

type FieldErrors = Partial<Record<CustomThemeTokenField | "name", string>>;

type Draft = { name: string } & Record<CustomThemeTokenField, string>;

type TokenGroup = { legend: string; fields: CustomThemeTokenField[] };

const TOKEN_GROUPS: TokenGroup[] = [
  { legend: "Surfaces", fields: ["background", "surface", "surface2", "border", "borderStrong"] },
  { legend: "Text", fields: ["foreground", "muted"] },
  { legend: "Brand", fields: ["primary", "primaryForeground", "primaryHover", "accent", "accentForeground"] },
  { legend: "Status", fields: ["danger", "info", "online", "offline"] },
];

const FIELD_LABELS: Record<CustomThemeTokenField, string> = {
  background: "Background",
  surface: "Surface",
  surface2: "Surface 2",
  border: "Border",
  borderStrong: "Border (strong)",
  foreground: "Foreground",
  muted: "Muted",
  primary: "Primary",
  primaryForeground: "Primary foreground",
  primaryHover: "Primary hover",
  accent: "Accent",
  accentForeground: "Accent foreground",
  danger: "Danger",
  info: "Info",
  online: "Online",
  offline: "Offline",
};

const SWATCH_PREVIEW_FIELDS = ["background", "surface", "primary", "accent"] as const;

// Reasonable starting point for a brand-new theme -- an opaque-hex
// derivation of the Obsidian built-in theme's tokens (lib/themes.ts /
// app/globals.css). The CustomTheme schema requires strict `#rrggbb` (no
// alpha channel), so the built-in theme's translucent border colors are
// approximated here as flattened opaque hex; these are just defaults an
// admin will typically repaint anyway.
const BLANK_DRAFT_TOKENS: Record<CustomThemeTokenField, string> = {
  background: "#0a0d0b",
  surface: "#121611",
  surface2: "#181d17",
  border: "#232523",
  borderStrong: "#363937",
  foreground: "#edf2ec",
  muted: "#93a191",
  primary: "#34c47c",
  primaryForeground: "#05130a",
  primaryHover: "#2aa869",
  accent: "#e8a94a",
  accentForeground: "#1a1206",
  danger: "#e5484d",
  info: "#4aa8e8",
  online: "#34c47c",
  offline: "#6b746a",
};

function blankDraft(): Draft {
  return { name: "", ...BLANK_DRAFT_TOKENS };
}

function themeToDraft(theme: CustomTheme): Draft {
  const draft = { name: theme.name } as Draft;
  for (const field of CUSTOM_THEME_TOKEN_FIELDS) {
    draft[field] = theme[field];
  }
  return draft;
}

function sortByName(a: CustomTheme, b: CustomTheme) {
  return a.name.localeCompare(b.name);
}

async function parseApiError(
  res: Response,
  fallback: string,
): Promise<{ message: string; details: { field: string; message: string }[] }> {
  const body = (await res.json().catch(() => null)) as
    | { error?: { message?: string; details?: { field: string; message: string }[] } }
    | null;
  return { message: body?.error?.message ?? fallback, details: body?.error?.details ?? [] };
}

function ColorField({
  field,
  label,
  value,
  onChange,
  error,
}: {
  field: CustomThemeTokenField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchorSide, setAnchorSide] = useState<"left" | "right">("left");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function handleHexInput(raw: string) {
    setHexDraft(raw);
    const parsed = parseHex(raw);
    if (parsed) onChange(rgbToHex(parsed.r, parsed.g, parsed.b));
  }

  // Same click-outside/Escape-close pattern as components/theme/theme-picker.tsx's
  // popover: each ColorField instance owns its own ref/effect (up to 16 render per
  // form), so multiple can be open independently -- e.g. via rapid tabbing -- and
  // each still closes correctly on its own outside click or Escape, without
  // interfering with sibling instances.
  function closePicker() {
    setPickerOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!pickerOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePicker();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  // "Flip to fit" horizontal positioning: up to 16 of these render in a 2-column
  // grid, so a naive fixed `left-0` popover can render partially or fully
  // off-screen for a right-column swatch on narrower desktop windows (not just
  // mobile widths). Measure the trigger + rendered popover once it's in the DOM
  // (useLayoutEffect runs before paint, so there's no visible flash) and anchor
  // to whichever side keeps the popover's edge within the viewport.
  useLayoutEffect(() => {
    if (!pickerOpen) return;
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const margin = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverWidth = popover.getBoundingClientRect().width;

    const fitsLeft = triggerRect.left + popoverWidth + margin <= window.innerWidth;
    const fitsRight = triggerRect.right - popoverWidth - margin >= 0;

    if (fitsLeft) {
      setAnchorSide("left");
    } else if (fitsRight) {
      setAnchorSide("right");
    } else {
      // Neither side fully fits (very narrow viewport) -- pick whichever clips less.
      setAnchorSide(triggerRect.left > window.innerWidth - triggerRect.right ? "right" : "left");
    }
  }, [pickerOpen]);

  const legibleForeground = readableForeground(value);
  const inputId = `theme-field-${field}`;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <div ref={panelRef} className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label={`Pick ${label} color`}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            className="h-8 w-8 rounded-md border border-border-strong transition hover:border-primary/50"
            style={{ backgroundColor: value }}
          />
          {pickerOpen && (
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={`${label} color picker`}
              className={`fixed inset-x-4 top-1/2 z-20 -translate-y-1/2 rounded-lg border border-border-strong bg-surface-2 p-3 shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-fit sm:translate-y-0 ${
                anchorSide === "right" ? "sm:right-0" : "sm:left-0"
              }`}
            >
              <HexColorPicker color={value} onChange={onChange} />
              <button
                type="button"
                onClick={closePicker}
                className="mt-2 w-full rounded-md border border-border-strong px-2 py-1 text-xs font-medium text-muted transition hover:text-foreground"
              >
                Done
              </button>
            </div>
          )}
        </div>
        <input
          id={inputId}
          type="text"
          inputMode="text"
          spellCheck={false}
          value={hexDraft ?? value}
          onFocus={() => setHexDraft(value)}
          onChange={(e) => handleHexInput(e.target.value)}
          onBlur={() => setHexDraft(null)}
          className={`h-8 min-w-0 flex-1 rounded-md border bg-surface px-2 font-mono text-xs text-foreground outline-none focus-visible:border-primary ${
            error ? "border-danger" : "border-border-strong"
          }`}
        />
        <span
          aria-hidden
          title="Legibility preview"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-[10px] font-semibold"
          style={{ backgroundColor: value, color: legibleForeground }}
        >
          Aa
        </span>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function ThemePreview({ draft }: { draft: Draft }) {
  const vars = customThemeFieldsToCssVars(draft) as CSSProperties;
  return (
    <div
      style={vars}
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-5 text-foreground"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Live preview</p>
      <div className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface p-4">
        <h3 className="text-sm font-semibold text-foreground">{draft.name.trim() || "Untitled theme"}</h3>
        <p className="text-xs text-muted">Sample body copy on a surface panel, using the muted token.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Primary button
          </button>
          <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
            Accent button
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            Danger callout
          </div>
          <div className="flex-1 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-info">
            Info callout
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-online" /> Online
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-offline" /> Offline
          </span>
        </div>
      </div>
    </div>
  );
}

export function CustomThemesAdmin({ initialThemes }: { initialThemes: CustomTheme[] }) {
  const { showError, showSuccess } = useToast();
  const [themes, setThemes] = useState(initialThemes);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function updateField(field: CustomThemeTokenField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setDraft(blankDraft());
    setFieldErrors({});
    setFormOpen(true);
  }

  function openEdit(theme: CustomTheme) {
    setEditingId(theme.id);
    setDraft(themeToDraft(theme));
    setFieldErrors({});
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFieldErrors({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setFieldErrors({ name: "Name is required." });
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const isEdit = editingId !== null;

    try {
      const body: Record<string, string> = { name };
      for (const field of CUSTOM_THEME_TOKEN_FIELDS) body[field] = draft[field];

      const res = await fetch(isEdit ? `/api/custom-themes/${editingId}` : "/api/custom-themes", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const { message, details } = await parseApiError(
          res,
          isEdit ? "Failed to update theme." : "Failed to create theme.",
        );
        if (details.length > 0) {
          const errs: FieldErrors = {};
          for (const d of details) errs[d.field as CustomThemeTokenField | "name"] = d.message;
          setFieldErrors(errs);
        } else if (res.status === 409) {
          setFieldErrors({ name: message });
        }
        showError(message);
        return;
      }

      const { data } = (await res.json()) as { data: CustomTheme };
      setThemes((prev) => (isEdit ? prev.map((t) => (t.id === data.id ? data : t)) : [...prev, data]).sort(sortByName));
      showSuccess(isEdit ? "Theme updated." : "Theme created.");
      closeForm();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteTheme(theme: CustomTheme) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${theme.name}"? Any page using it will fall back to its default theme.`)
    ) {
      return;
    }

    const previous = themes;
    setThemes((prev) => prev.filter((t) => t.id !== theme.id));
    try {
      const res = await fetch(`/api/custom-themes/${theme.id}`, { method: "DELETE" });
      if (!res.ok) {
        const { message } = await parseApiError(res, "Failed to delete theme.");
        throw new Error(message);
      }
      showSuccess(`Deleted "${theme.name}".`);
      if (editingId === theme.id) closeForm();
    } catch (error) {
      setThemes(previous);
      showError(error instanceof Error ? error.message : "Failed to delete theme.");
    }
  }

  async function toggleVisible(theme: CustomTheme) {
    const previous = themes;
    setThemes((prev) => prev.map((t) => (t.id === theme.id ? { ...t, showInPicker: !t.showInPicker } : t)));
    try {
      const res = await fetch(`/api/custom-themes/${theme.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showInPicker: !theme.showInPicker }),
      });
      if (!res.ok) {
        const { message } = await parseApiError(res, "Failed to update theme visibility.");
        throw new Error(message);
      }
    } catch (error) {
      setThemes(previous);
      showError(error instanceof Error ? error.message : "Failed to update theme visibility.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Swatches</th>
              <th className="px-4 py-2.5 font-medium">Picker</th>
              <th className="px-4 py-2.5 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {themes.length === 0 && (
              <tr className="bg-surface">
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                  No custom themes yet.
                </td>
              </tr>
            )}
            {themes.map((theme) => (
              <tr key={theme.id} className="bg-surface">
                <td className="px-4 py-3 font-medium text-foreground">{theme.name}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {SWATCH_PREVIEW_FIELDS.map((field) => (
                      <span
                        key={field}
                        aria-hidden
                        title={FIELD_LABELS[field]}
                        className="h-5 w-5 rounded-sm border border-border-strong"
                        style={{ backgroundColor: theme[field] }}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleVisible(theme)}
                    aria-pressed={theme.showInPicker}
                    title="Whether visitors can select this theme from the site's footer theme picker"
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      theme.showInPicker
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border-strong text-muted hover:text-foreground"
                    }`}
                  >
                    {theme.showInPicker ? "Visible" : "Hidden"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(theme)}
                      className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                    >
                      Edit
                    </button>
                    <DeleteButton label="Delete theme" onClick={() => deleteTheme(theme)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!formOpen && (
        <AddButton onClick={openCreate} className="w-fit">
          New theme
        </AddButton>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-6 rounded-lg border border-border-strong bg-surface p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "Edit theme" : "New theme"}</h2>
            <button
              type="button"
              onClick={closeForm}
              className="text-xs font-medium text-muted transition hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="theme-name" className="text-xs font-medium text-muted">
              Name
            </label>
            <input
              id="theme-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Midnight Garden"
              className={`h-9 rounded-md border bg-surface-2 px-3 text-sm text-foreground outline-none focus-visible:border-primary ${
                fieldErrors.name ? "border-danger" : "border-border-strong"
              }`}
            />
            {fieldErrors.name && <p className="text-xs text-danger">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              {TOKEN_GROUPS.map((group) => (
                <fieldset key={group.legend} className="flex flex-col gap-3 rounded-md border border-border p-3">
                  <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
                    {group.legend}
                  </legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <ColorField
                        key={field}
                        field={field}
                        label={FIELD_LABELS[field]}
                        value={draft[field]}
                        onChange={(value) => updateField(field, value)}
                        error={fieldErrors[field]}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="lg:sticky lg:top-4 lg:self-start">
              <ThemePreview draft={draft} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving…" : editingId ? "Save changes" : "Create theme"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="flex h-9 items-center justify-center rounded-md border border-border-strong px-4 text-sm font-medium text-muted transition hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
