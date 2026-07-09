"use client";

import type { ElementType } from "react";
import { EditableText } from "@/components/admin/editable-text";

type EditableContentProps = {
  contentKey: string;
  initialValue: string;
  as?: ElementType;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  label: string;
};

/**
 * Thin wrapper around EditableText for `ContentBlock` rows (hero name,
 * tagline, server IP, ...). Exists as its own Client Component so Server
 * Components (e.g. components/home/hero.tsx) can render it directly with
 * plain serializable props instead of passing a save function across the
 * server/client boundary.
 */
export function EditableContent({
  contentKey,
  initialValue,
  as,
  multiline,
  className,
  placeholder,
  label,
}: EditableContentProps) {
  async function handleSave(next: string) {
    const res = await fetch(`/api/content/${encodeURIComponent(contentKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: next }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? "Failed to save changes.");
    }
  }

  return (
    <EditableText
      value={initialValue}
      onSave={handleSave}
      as={as}
      multiline={multiline}
      className={className}
      placeholder={placeholder}
      label={label}
    />
  );
}
