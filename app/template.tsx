import type { ReactNode } from "react";

/**
 * Templates (unlike layout.tsx) remount on every navigation, which is what
 * gives each page a fresh CSS animation run -- the standard App Router
 * technique for a page-transition feel without a client-side animation
 * library. `.page-enter` (app/globals.css) is itself guarded behind
 * `prefers-reduced-motion: no-preference`, so this is a no-op for visitors
 * who've asked for reduced motion. `flex flex-1 flex-col` mirrors the
 * wrapping `<main>` in app/layout.tsx so pages that rely on filling the
 * viewport height (e.g. the login page) keep working unchanged.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
