import { pagePath } from "@/lib/routes";
import { slugSchema } from "@/lib/validation/pages";

export type WikiPageReference = {
  slug: string;
  title: string;
};

export type ParsedWikiLink = {
  slug: string;
  label: string;
};

export function parseWikiLink(source: string): ParsedWikiLink | null {
  const match = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(source);
  if (!match) return null;

  const slug = match[1];
  if (!slugSchema.safeParse(slug).success) return null;
  const label = match[2] ?? slug;
  if (!label.trim()) return null;
  return { slug, label };
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/([\[\]])/g, "\\$1").replace(/\r?\n/g, " ");
}

function rewritePlainText(text: string, pages: ReadonlyMap<string, WikiPageReference>): string {
  let output = "";
  let cursor = 0;

  while (cursor < text.length) {
    if (!text.startsWith("[[", cursor)) {
      output += text[cursor];
      cursor += 1;
      continue;
    }

    const end = text.indexOf("]]", cursor + 2);
    if (end === -1) {
      output += text.slice(cursor);
      break;
    }

    const source = text.slice(cursor, end + 2);
    const parsed = parseWikiLink(source);
    if (!parsed) {
      output += source;
    } else {
      const target = pages.get(parsed.slug);
      const href = target ? pagePath(target.slug) : "#wiki-missing";
      output += `[${escapeMarkdownLabel(parsed.label)}](${href})`;
    }
    cursor = end + 2;
  }

  return output;
}

/** Rewrites wiki-link syntax while preserving fenced and inline code spans. */
export function rewriteWikiLinks(markdown: string, pages: readonly WikiPageReference[]): string {
  const pageMap = new Map(pages.map((page) => [page.slug, page]));
  let output = "";
  let cursor = 0;
  let codeDelimiter: string | null = null;

  while (cursor < markdown.length) {
    if (codeDelimiter) {
      if (markdown.startsWith(codeDelimiter, cursor)) {
        output += codeDelimiter;
        cursor += codeDelimiter.length;
        codeDelimiter = null;
      } else {
        output += markdown[cursor];
        cursor += 1;
      }
      continue;
    }

    const marker = markdown[cursor];
    if (marker === "`" || marker === "~") {
      let end = cursor + 1;
      while (end < markdown.length && markdown[end] === marker) end += 1;
      const length = end - cursor;
      if (marker === "~" && length < 3) {
        output += markdown.slice(cursor, end);
        cursor = end;
        continue;
      }
      codeDelimiter = marker.repeat(length);
      output += codeDelimiter;
      cursor = end;
      continue;
    }

    const nextBacktick = markdown.indexOf("`", cursor);
    const nextTilde = markdown.indexOf("~", cursor);
    const nextLink = markdown.indexOf("[[", cursor);
    const nextMarker = nextBacktick === -1 ? nextTilde : nextTilde === -1 ? nextBacktick : Math.min(nextBacktick, nextTilde);
    const nextBoundary = nextLink === -1 ? markdown.length : nextLink;

    if (nextMarker !== -1 && nextMarker < nextBoundary) {
      output += markdown.slice(cursor, nextMarker);
      cursor = nextMarker;
    } else if (nextLink === -1) {
      output += markdown.slice(cursor);
      break;
    } else {
      output += rewritePlainText(markdown.slice(cursor, nextLink), pageMap);
      cursor = nextLink;
      const end = markdown.indexOf("]]", cursor + 2);
      if (end === -1) {
        output += markdown.slice(cursor);
        break;
      }
      const source = markdown.slice(cursor, end + 2);
      const parsed = parseWikiLink(source);
      if (!parsed) output += source;
      else {
        const target = pageMap.get(parsed.slug);
        const href = target ? pagePath(target.slug) : "#wiki-missing";
        output += `[${escapeMarkdownLabel(parsed.label)}](${href})`;
      }
      cursor = end + 2;
    }
  }

  return output;
}
