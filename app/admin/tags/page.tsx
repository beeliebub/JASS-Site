import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { prisma } from "@/lib/prisma";
import { TagsAdmin } from "@/components/admin/tags-admin";

export const metadata = { title: "Tags — Admin" };

export default async function AdminTagsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
  });

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Tags</h1>
        <p className="text-sm text-muted">
          Every tag used across every Post List block. Renaming or recoloring a tag here updates it everywhere
          it&apos;s shown. A tag still used by a post can&apos;t be deleted.
        </p>
      </div>

      <TagsAdmin initialTags={tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, postCount: tag._count.posts }))} />
    </Container>
  );
}
