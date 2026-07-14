"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type EditModeContextValue = {
  /** True only when the viewer is an admin AND has flipped the toggle on. */
  editMode: boolean;
  /** True whenever the viewer has an admin session, regardless of toggle state. */
  isAdmin: boolean;
  /** False when the OWNER has engaged the site-wide content-editing lock. */
  editingEnabled: boolean;
  toggle: () => void;
};

const EditModeContext = createContext<EditModeContextValue | null>(null);

/**
 * Provides global edit-mode state. `isAdmin` comes from the server session
 * (app/layout.tsx) and is the only thing that can ever unlock `editMode` —
 * a non-admin flipping client state can never get `editMode: true` here,
 * since `toggle` is a no-op when `isAdmin` is false. This is a UX gate only;
 * every mutation route re-checks the session server-side (see
 * lib/auth-guard.ts), so this component leaking would not be a security bug.
 */
export function EditModeProvider({
  isAdmin,
  editingEnabled,
  children,
}: {
  isAdmin: boolean;
  editingEnabled: boolean;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);

  const toggle = useCallback(() => {
    if (!isAdmin || !editingEnabled) return;
    setEnabled((v) => !v);
  }, [isAdmin, editingEnabled]);

  const value = useMemo<EditModeContextValue>(
    () => ({ editMode: isAdmin && editingEnabled && enabled, isAdmin, editingEnabled, toggle }),
    [isAdmin, editingEnabled, enabled, toggle],
  );

  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>;
}

export function useEditMode(): EditModeContextValue {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error("useEditMode must be used within an EditModeProvider");
  }
  return ctx;
}
