"use client";

import type { ReactNode } from "react";
import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { createWikiHeadingIdFactory } from "@/components/blocks/wiki-headings";
import { rewriteWikiLinks, type WikiPageReference } from "@/lib/wiki-links";

function textFromChildren(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map((child) => textFromChildren(child)).join("");
  if (React.isValidElement<{ children?: ReactNode }>(children)) return textFromChildren(children.props.children);
  return "";
}

export function WikiMarkdown({
  markdown,
  pages,
  showMissingLinks = false,
  showHeadingIds = false,
}: {
  markdown: string;
  pages: readonly WikiPageReference[];
  showMissingLinks?: boolean;
  showHeadingIds?: boolean;
}) {
  const rewritten = useMemo(() => rewriteWikiLinks(markdown, pages), [markdown, pages]);
  const getHeadingId = createWikiHeadingIdFactory();

  const components: Components = {
    a: ({ href, children, ...props }) => {
      if (href === "#wiki-missing" && !showMissingLinks) return <span>{children}</span>;
      return (
        <a
          href={href}
          {...props}
          className={href === "#wiki-missing" ? "text-danger underline decoration-dotted" : undefined}
        >
          {children}
        </a>
      );
    },
  };

  if (showHeadingIds) {
    components.h1 = ({ children, ...props }) => {
      const id = getHeadingId(textFromChildren(children));
      return <h1 id={id} {...props}>{children}</h1>;
    };
    components.h2 = ({ children, ...props }) => {
      const id = getHeadingId(textFromChildren(children));
      return <h2 id={id} {...props}>{children}</h2>;
    };
    components.h3 = ({ children, ...props }) => {
      const id = getHeadingId(textFromChildren(children));
      return <h3 id={id} {...props}>{children}</h3>;
    };
    components.h4 = ({ children, ...props }) => {
      const id = getHeadingId(textFromChildren(children));
      return <h4 id={id} {...props}>{children}</h4>;
    };
    components.h5 = ({ children, ...props }) => {
      const id = getHeadingId(textFromChildren(children));
      return <h5 id={id} {...props}>{children}</h5>;
    };
    components.h6 = ({ children, ...props }) => {
      const id = getHeadingId(textFromChildren(children));
      return <h6 id={id} {...props}>{children}</h6>;
    };
  }

  return <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={components}>{rewritten}</ReactMarkdown>;
}
