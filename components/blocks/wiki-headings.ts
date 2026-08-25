export type WikiHeading = {
  level: number;
  text: string;
  id: string;
};

export function slugifyWikiHeading(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

export function createWikiHeadingIdFactory() {
  const counts = new Map<string, number>();
  return (text: string) => {
    const base = slugifyWikiHeading(text);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

export function extractWikiHeadings(markdown: string): WikiHeading[] {
  const getId = createWikiHeadingIdFactory();
  const headings: WikiHeading[] = [];
  let fence: string | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      continue;
    }
    if (fence) continue;

    const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].trim();
    if (!text) continue;
    headings.push({ level: match[1].length, text, id: getId(text) });
  }

  return headings;
}
