import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { TagPill } from "@/components/news/tag-pill";
import { getPostListDirectory, pagePath, type PostListBlockGroup } from "@/lib/content";

export const metadata = { title: "Post slugs — Admin" };

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function groupByPage(blocks: PostListBlockGroup[]) {
  const groups: { pageId: string; pageSlug: string; pageTitle: string; blocks: PostListBlockGroup[] }[] = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if (last && last.pageId === block.pageId) {
      last.blocks.push(block);
    } else {
      groups.push({ pageId: block.pageId, pageSlug: block.pageSlug, pageTitle: block.pageTitle, blocks: [block] });
    }
  }
  return groups;
}

function PostRows({ posts }: { posts: PostListBlockGroup["posts"] }) {
  if (posts.length === 0) {
    return <p className="py-2 text-sm text-muted">No posts yet.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/news/${post.slug}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 transition hover:bg-surface-2"
        >
          <span className="font-mono text-xs text-primary">{post.slug}</span>
          <span className="text-sm font-medium text-foreground">{post.title}</span>
          <TagPill tag={post.tag} />
          <span className="ml-auto text-xs text-muted">{formatDate(post.publishedAt)}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function PostSlugsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const directory = await getPostListDirectory();
  const pages = groupByPage(directory);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Post slugs</h1>
        <p className="text-sm text-muted">
          Every post across every Post List block, grouped by the page and block instance that owns it.
        </p>
      </div>

      {pages.length === 0 ? (
        <p className="text-sm text-muted">No Post List blocks exist yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {pages.map((page) => (
            <div key={page.pageId} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-foreground">
                <Link href={pagePath(page.pageSlug)} className="hover:underline">
                  {page.pageTitle}
                </Link>
                <span className="ml-2 font-mono text-xs font-normal text-muted">{page.pageSlug}</span>
              </h2>
              {page.blocks.length > 1 ? (
                <div className="flex flex-col gap-4">
                  {page.blocks.map((block, i) => (
                    <div key={block.blockId} className="rounded-md border border-border bg-surface p-4">
                      <h3 className="text-sm font-medium text-muted">
                        Post List block {i + 1} of {page.blocks.length}
                      </h3>
                      <PostRows posts={block.posts} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-surface p-4">
                  <PostRows posts={page.blocks[0].posts} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}
