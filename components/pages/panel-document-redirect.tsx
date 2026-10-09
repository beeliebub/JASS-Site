"use client";

import { useEffect } from "react";

export function PanelDocumentRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[50vh] w-full max-w-6xl flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <p role="status" className="text-sm text-muted">
        Opening the server panel…
      </p>
      <a href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Continue to the panel
      </a>
    </main>
  );
}
