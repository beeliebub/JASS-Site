import { Container } from "@/components/container";
import { CopyButton } from "@/components/resource/copy-button";
import { formatBytes } from "@/lib/format";

export type ResourcePackSummary = {
  id: string;
  filename: string;
  size: number;
  sha1: string;
  uuid: string;
  downloadUrl: string;
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
  packs,
}: {
  packs: ResourcePackSummary[];
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
            Download a pack directly, or point your <code className="font-mono text-xs">server.properties</code> at
            its snippet below so it applies automatically when you join.
          </p>
        </header>

        {packs.length > 0 ? (
          <div className="mt-8 flex max-w-3xl flex-col gap-6">
            {packs.map((pack) => {
              const snippet = `resource-pack=${pack.downloadUrl}\nresource-pack-sha1=${pack.sha1}\nresource-pack-id=${pack.uuid}`;
              return (
                <article key={pack.id} className="flex flex-col gap-6 rounded-lg border border-border-strong bg-surface p-6">
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{pack.filename}</p>
                      <p className="mt-1 text-sm text-muted">
                        {formatBytes(pack.size)} · uploaded{" "}
                        <time dateTime={pack.uploadedAt} className="font-mono text-xs">
                          {formatDate(pack.uploadedAt)}
                        </time>
                      </p>
                    </div>
                    <a
                      href={pack.downloadUrl}
                      download
                      className="flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover motion-safe:active:scale-[0.97]"
                    >
                      Download resource pack
                    </a>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">SHA-1 digest</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-foreground">
                          {pack.sha1}
                        </code>
                        <CopyButton value={pack.sha1} label={`Copy SHA-1 digest for ${pack.filename}`} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Resource-pack ID</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-foreground">
                          {pack.uuid}
                        </code>
                        <CopyButton value={pack.uuid} label={`Copy resource-pack ID for ${pack.filename}`} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">server.properties snippet</p>
                      <CopyButton value={snippet} label={`Copy server.properties snippet for ${pack.filename}`} />
                    </div>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                      <code>{snippet}</code>
                    </pre>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-8 max-w-2xl text-pretty text-muted">No resource packs uploaded yet.</p>
        )}
      </Container>
    </section>
  );
}
