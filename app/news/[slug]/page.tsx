import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Container } from "@/components/container";
import { TagPill } from "@/components/news/tag-pill";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await prisma.post.findUnique({ where: { slug } });
  if (!post) return { title: "Post not found" };

  return {
    title: `${post.title} — JASS`,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt },
    twitter: { title: post.title, description: post.excerpt },
  };
}

export default async function PostDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.post.findUnique({ where: { slug }, include: { tags: true } });
  if (!post) notFound();

  return (
    <Container className="flex flex-1 flex-col py-12 sm:py-16">
      <Link href="/news" className="w-fit text-sm text-muted transition-colors hover:text-primary">
        ← Back to News
      </Link>

      <article className="mt-6 max-w-2xl">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <time dateTime={post.publishedAt.toISOString()} className="font-mono text-xs text-muted">
            {formatDate(post.publishedAt)}
          </time>
          {post.tags.map((tag) => (
            <TagPill key={tag.id} tag={tag} />
          ))}
          {post.author && (
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">by {post.author}</span>
          )}
        </div>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          {post.title}
        </h1>

        <p className="mt-4 text-pretty text-muted">{post.excerpt}</p>

        {post.body && (
          <div className="markdown-content mt-8 border-t border-border pt-8">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{post.body}</ReactMarkdown>
          </div>
        )}
      </article>
    </Container>
  );
}
