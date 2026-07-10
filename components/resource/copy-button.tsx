"use client";

import { useState } from "react";

/** Small icon-button copy affordance shared by ResourcePackView's SHA-1 and
 * snippet blocks -- same fail-silent clipboard handling as
 * components/home/copy-ip-button.tsx. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) -- the value is
      // still visible and selectable as plain text.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-muted transition hover:border-primary hover:text-primary motion-safe:active:scale-90"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M3 7.5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <rect x="5.5" y="5.5" width="7" height="7" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3 8.5V3a1 1 0 0 1 1-1h5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
