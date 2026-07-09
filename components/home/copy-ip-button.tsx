"use client";

import { useEffect, useRef, useState } from "react";

export function CopyIpButton({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently,
      // the IP is still visible and selectable as plain text.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-4 text-sm font-medium text-foreground transition hover:bg-primary hover:text-primary-foreground hover:border-primary focus-visible:bg-primary focus-visible:text-primary-foreground motion-safe:active:scale-[0.97]"
    >
      {copied ? (
        <span key="copied" className="icon-pop-enter flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 8.5l3 3 7-7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span aria-live="polite">Copied</span>
        </span>
      ) : (
        <span key="idle" className="icon-pop-enter flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3 10.5V3.5a1 1 0 0 1 1-1H10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span>Copy IP</span>
        </span>
      )}
    </button>
  );
}
