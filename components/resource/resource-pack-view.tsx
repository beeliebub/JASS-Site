import { Container } from "@/components/container";
import { CopyButton } from "@/components/resource/copy-button";

export type ResourcePackSummary = {
  filename: string;
  sha1: string;
  /** ISO string -- converted from the Prisma `Date` in app/resource/page.tsx
   * before crossing into this (partly client) tree, matching the
   * publishedAt/createdAt convention in page-renderer.tsx and
   * app/admin/users/page.tsx. */
  uploadedAt: string;
};

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

export function ResourcePackView({
  pack,
  downloadUrl,
}: {
  pack: ResourcePackSummary | null;
  downloadUrl: string;
}) {
  return (
    <section className="border-b border-border bg-grid">
      <Container className="py-12 sm:py-16">
        <header className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Resource Pack</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Get the JASS resource pack
          </h1>
          <p className="mt-3 text-pretty text-muted">
            Download the pack directly, or point your <code className="font-mono text-xs">server.properties</code>{" "}
            at the snippet below so it applies automatically when you join.
          </p>
        </header>

        {pack ? (
          <div className="mt-8 flex max-w-2xl flex-col gap-6">
            <div className="flex flex-col items-start gap-4 rounded-lg border border-border-strong bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{pack.filename}</p>
                <p className="mt-1 text-sm text-muted">
                  Uploaded{" "}
                  <time dateTime={pack.uploadedAt} className="font-mono text-xs">
                    {formatDate(pack.uploadedAt)}
                  </time>
                </p>
              </div>
              <a
                href={downloadUrl}
                download
                className="flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover motion-safe:active:scale-[0.97]"
              >
                Download resource pack
              </a>
            </div>

            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">SHA-1 digest</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-foreground">
                  {pack.sha1}
                </code>
                <CopyButton value={pack.sha1} label="Copy SHA-1 digest" />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">server.properties snippet</p>
                <CopyButton
                  value={`resource-pack=${downloadUrl}\nresource-pack-sha1=${pack.sha1}`}
                  label="Copy server.properties snippet"
                />
              </div>
              <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                <code>{`resource-pack=${downloadUrl}\nresource-pack-sha1=${pack.sha1}`}</code>
              </pre>
            </div>
          </div>
        ) : (
          <p className="mt-8 max-w-2xl text-pretty text-muted">No resource pack uploaded yet.</p>
        )}
      </Container>
    </section>
  );
}
