import type { Element, Nodes, Properties, Root } from "hast";
import { find, html as htmlPropertySchema } from "property-information";
import rehypeSanitize from "rehype-sanitize";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { escapeHtml } from "@/lib/custom-html-template";

const markdownProcessor = unified().use(remarkParse).use(remarkRehype).use(rehypeSanitize);

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "basefont",
  "bgsound",
  "link",
  "meta",
  "br",
  "col",
  "command",
  "embed",
  "frame",
  "hr",
  "img",
  "input",
  "keygen",
  "param",
  "source",
  "track",
  "wbr",
]);

function serializeProperty(name: string, value: Properties[string]): string {
  if (value === null || value === undefined || value === false) return "";

  const info = find(htmlPropertySchema, name);
  if (value === true && (info.boolean || info.overloadedBoolean)) return ` ${info.attribute}`;

  let serialized: string;
  if (Array.isArray(value)) {
    const separator = info.commaSeparated || info.commaOrSpaceSeparated ? "," : " ";
    serialized = value.join(separator);
  } else {
    serialized = String(value);
  }
  return ` ${info.attribute}="${escapeHtml(serialized)}"`;
}

function serializeElement(node: Element): string {
  const attributes = Object.entries(node.properties).map(([name, value]) => serializeProperty(name, value)).join("");
  const openingTag = `<${node.tagName}${attributes}>`;
  if (VOID_ELEMENTS.has(node.tagName)) return openingTag;
  return `${openingTag}${node.children.map(serializeNode).join("")}</${node.tagName}>`;
}

function serializeNode(node: Nodes): string {
  switch (node.type) {
    case "root":
      return node.children.map(serializeNode).join("");
    case "element":
      return serializeElement(node);
    case "text":
      return escapeHtml(node.value);
    case "comment":
    case "doctype":
      return "";
    case "raw":
      return escapeHtml(node.value);
  }
}

/** Converts Markdown with the same remark/rehype-sanitize pipeline used by
 * react-markdown, then serializes the sanitized HAST without importing the
 * React server renderer into Next's Server Component graph. */
export function renderRichTextToHtml(markdown: string): string {
  const tree = markdownProcessor.runSync(markdownProcessor.parse(markdown)) as Root;
  return serializeNode(tree);
}
