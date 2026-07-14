import { parseHex, type Rgb } from "@/lib/color";

export type CustomHtmlTemplateField = {
  key: string;
  fieldType: string;
  config?: unknown;
};

export type CustomHtmlPlaceholderReferences = {
  scalarKeys: string[];
  repeaters: Array<{ key: string; itemKeys: string[] }>;
};

export type CustomHtmlInterpolationOptions = Readonly<{
  /** Rich text is safe HTML only when the caller supplies a sanitizing renderer. */
  renderRichText?: (markdown: string) => string;
}>;

const EACH_BLOCK_PATTERN = /{{\s*#each\s+([^{}\s]+)\s*}}([\s\S]*?){{\s*\/each\s*}}/g;
const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const FIELD_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function uniqueInEncounterOrder(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function extractScalarKeys(fragment: string): string[] {
  const keys: string[] = [];
  for (const match of fragment.matchAll(PLACEHOLDER_PATTERN)) {
    const token = match[1].trim();
    if (FIELD_KEY_PATTERN.test(token)) keys.push(token);
  }
  return uniqueInEncounterOrder(keys);
}

/** Checks the small template grammar independently from field references so
 * malformed or nested directives fail at authoring time instead of being
 * partially removed during interpolation. Attribute placeholders must be
 * quoted because ordinary HTML escaping cannot make every possible string
 * safe in an unquoted attribute value. */
export function validateCustomHtmlTemplateSyntax(template: string): string[] {
  const errors: string[] = [];
  const tokenPattern = /{{\s*([^{}]+?)\s*}}/g;
  let activeRepeater: string | undefined;

  for (const match of template.matchAll(tokenPattern)) {
    const token = match[1].trim();
    const eachMatch = /^#each\s+([^\s]+)$/.exec(token);
    if (eachMatch) {
      if (!FIELD_KEY_PATTERN.test(eachMatch[1])) errors.push(`Invalid repeater key "${eachMatch[1]}".`);
      if (activeRepeater) errors.push("Nested repeater loops are not supported.");
      activeRepeater = eachMatch[1];
      continue;
    }
    if (token === "/each") {
      if (!activeRepeater) errors.push('Unexpected "{{/each}}" without an open repeater loop.');
      activeRepeater = undefined;
      continue;
    }
    if (!FIELD_KEY_PATTERN.test(token)) errors.push(`Invalid placeholder token "{{${token}}}".`);
  }

  if (activeRepeater) errors.push(`Repeater "${activeRepeater}" is missing "{{/each}}".`);
  const textWithoutTokens = template.replace(tokenPattern, "");
  if (textWithoutTokens.includes("{{") || textWithoutTokens.includes("}}")) {
    errors.push("Every placeholder must use a complete {{key}} token.");
  }
  if (/<[^>]*\s[\w:-]+\s*=\s*[^\s"'<>`]*{{\s*[^{}]+\s*}}/i.test(template)) {
    errors.push("Placeholders in HTML attributes must be wrapped in quotes.");
  }

  return uniqueInEncounterOrder(errors);
}

/**
 * Extracts top-level scalar references and one-level repeater references.
 * Repeated repeater blocks remain separate so validation can report the
 * specific loop whose item key is stale or misspelled.
 */
export function extractCustomHtmlPlaceholders(template: string): CustomHtmlPlaceholderReferences {
  const repeaters: CustomHtmlPlaceholderReferences["repeaters"] = [];
  const templateWithoutRepeaters = template.replace(EACH_BLOCK_PATTERN, (_match, key: string, body: string) => {
    repeaters.push({ key, itemKeys: extractScalarKeys(body) });
    return "";
  });

  return {
    scalarKeys: extractScalarKeys(templateWithoutRepeaters),
    repeaters,
  };
}

/** Escapes a value for both HTML text and quoted attribute contexts. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOwnValue(data: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
}

function parseConfig(config: unknown): Readonly<Record<string, unknown>> {
  if (isRecord(config)) return config;
  if (typeof config !== "string" || config.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(config);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function repeaterItemFields(field: CustomHtmlTemplateField): CustomHtmlTemplateField[] {
  const configuredFields = parseConfig(field.config).fields;
  if (!Array.isArray(configuredFields)) return [];

  return configuredFields.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.key !== "string" || typeof candidate.fieldType !== "string") {
      return [];
    }
    return [{ key: candidate.key, fieldType: candidate.fieldType, config: candidate.config }];
  });
}

function stringifyScalar(fieldType: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (fieldType === "boolean") return value === true ? "true" : "";
  if (fieldType === "number") return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  return typeof value === "string" ? value : "";
}

function interpolateScalars(
  fragment: string,
  fields: readonly CustomHtmlTemplateField[],
  data: Readonly<Record<string, unknown>>,
  options: CustomHtmlInterpolationOptions,
): string {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));

  return fragment.replace(PLACEHOLDER_PATTERN, (_match, rawToken: string) => {
    const key = rawToken.trim();
    if (!FIELD_KEY_PATTERN.test(key)) return "";

    const field = fieldsByKey.get(key);
    if (!field) return "";
    const value = readOwnValue(data, key);

    if (field.fieldType === "richText") {
      const markdown = typeof value === "string" ? value : "";
      return options.renderRichText ? options.renderRichText(markdown) : escapeHtml(markdown);
    }

    return escapeHtml(stringifyScalar(field.fieldType, value));
  });
}

/**
 * Interpolates escaped scalar values and one-level repeater rows. Boolean
 * fields render `"true"` when enabled and an empty string when disabled;
 * nullish or non-finite numbers also render as an empty string. Rich text is
 * escaped as plain markdown unless a trusted sanitizing renderer is supplied.
 */
export function interpolateCustomHtmlTemplate(
  template: string,
  fields: readonly CustomHtmlTemplateField[],
  data: Readonly<Record<string, unknown>>,
  options: CustomHtmlInterpolationOptions = {},
): string {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const withRepeaters = template.replace(EACH_BLOCK_PATTERN, (_match, rawKey: string, body: string) => {
    const field = fieldsByKey.get(rawKey);
    if (!field || field.fieldType !== "repeater") return "";

    const rows = readOwnValue(data, rawKey);
    if (!Array.isArray(rows)) return "";
    const itemFields = repeaterItemFields(field);

    return rows
      .filter(isRecord)
      .map((row) => interpolateScalars(body, itemFields, row, options))
      .join("");
  });

  return interpolateScalars(withRepeaters, fields, data, options);
}

type ThemeColorReference = Readonly<{ token: string; rgb: Rgb }>;

const CANONICAL_THEME_COLORS: readonly ThemeColorReference[] = [
  { token: "--background", rgb: { r: 10, g: 13, b: 11 } },
  { token: "--surface", rgb: { r: 18, g: 22, b: 17 } },
  { token: "--surface-2", rgb: { r: 24, g: 29, b: 23 } },
  // The canonical border tokens are translucent, so compare against their
  // visible obsidian composites rather than treating both as opaque white.
  { token: "--border", rgb: { r: 33, g: 36, b: 33 } },
  { token: "--border-strong", rgb: { r: 51, g: 54, b: 51 } },
  { token: "--foreground", rgb: { r: 237, g: 242, b: 236 } },
  { token: "--muted", rgb: { r: 147, g: 161, b: 145 } },
  { token: "--primary", rgb: { r: 52, g: 196, b: 124 } },
  { token: "--accent", rgb: { r: 232, g: 169, b: 74 } },
  { token: "--danger", rgb: { r: 229, g: 72, b: 77 } },
  { token: "--info", rgb: { r: 74, g: 168, b: 232 } },
];

function colorDistanceSquared(left: Rgb, right: Rgb): number {
  return (left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2;
}

function nearestThemeToken(color: string): string | null {
  const rgb = parseHex(color);
  if (!rgb) return null;

  let nearest = CANONICAL_THEME_COLORS[0];
  let nearestDistance = colorDistanceSquared(rgb, nearest.rgb);
  for (const candidate of CANONICAL_THEME_COLORS.slice(1)) {
    const distance = colorDistanceSquared(rgb, candidate.rgb);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return `var(${nearest.token})`;
}

function remapCssDeclarationValue(value: string): string {
  const match = /^(\s*)(#[0-9a-f]{3}(?:[0-9a-f]{3})?)(\s*(?:!important\s*)?)$/i.exec(value);
  if (!match) return value;
  const token = nearestThemeToken(match[2]);
  return token ? `${match[1]}${token}${match[3]}` : value;
}

function remapInlineStyle(style: string): string {
  return style.replace(
    /(^|;)(\s*)(color|background|background-color|border-color)(\s*:\s*)([^;]*)/gi,
    (_match, separator: string, spacing: string, property: string, colon: string, value: string) =>
      `${separator}${spacing}${property}${colon}${remapCssDeclarationValue(value)}`,
  );
}

type TagAttribute = {
  leadingStart: number;
  end: number;
  name: string;
  valueStart?: number;
  valueEnd?: number;
};

function parseTagAttributes(tag: string): TagAttribute[] {
  const attributes: TagAttribute[] = [];
  let index = 1;
  while (index < tag.length && !/[\s/>]/.test(tag[index])) index += 1;

  while (index < tag.length) {
    const leadingStart = index;
    while (/\s/.test(tag[index] ?? "")) index += 1;
    if (tag[index] === "/" || tag[index] === ">" || index >= tag.length) break;

    const nameStart = index;
    while (index < tag.length && !/[\s=/>]/.test(tag[index])) index += 1;
    const name = tag.slice(nameStart, index).toLowerCase();
    while (/\s/.test(tag[index] ?? "")) index += 1;

    let valueStart: number | undefined;
    let valueEnd: number | undefined;
    if (tag[index] === "=") {
      index += 1;
      while (/\s/.test(tag[index] ?? "")) index += 1;
      const quote = tag[index] === '"' || tag[index] === "'" ? tag[index] : undefined;
      if (quote) {
        index += 1;
        valueStart = index;
        while (index < tag.length && tag[index] !== quote) index += 1;
        valueEnd = index;
        if (tag[index] === quote) index += 1;
      } else {
        valueStart = index;
        while (index < tag.length && !/[\s>]/.test(tag[index])) index += 1;
        valueEnd = index;
      }
    }

    attributes.push({ leadingStart, end: index, name, valueStart, valueEnd });
  }

  return attributes;
}

function remapStartTag(tag: string): string {
  const attributes = parseTagAttributes(tag);
  const styleAttribute = attributes.find((attribute) => attribute.name === "style" && attribute.valueStart !== undefined);
  const presentationDeclarations: string[] = [];
  const mappedPresentationAttributes = new Set<TagAttribute>();

  for (const attribute of attributes) {
    if ((attribute.name !== "color" && attribute.name !== "bgcolor") || attribute.valueStart === undefined) continue;
    const value = tag.slice(attribute.valueStart, attribute.valueEnd);
    const token = nearestThemeToken(value.trim());
    if (!token) continue;
    const property = attribute.name === "color" ? "color" : "background-color";
    presentationDeclarations.push(`${property}: ${token}`);
    mappedPresentationAttributes.add(attribute);
  }

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  for (const attribute of mappedPresentationAttributes) {
    replacements.push({ start: attribute.leadingStart, end: attribute.end, text: "" });
  }

  if (styleAttribute?.valueStart !== undefined && styleAttribute.valueEnd !== undefined) {
    const authorStyle = remapInlineStyle(tag.slice(styleAttribute.valueStart, styleAttribute.valueEnd));
    const presentationStyle = presentationDeclarations.join(";");
    const separator = presentationStyle && authorStyle.trim() ? ";" : "";
    replacements.push({
      start: styleAttribute.valueStart,
      end: styleAttribute.valueEnd,
      text: `${presentationStyle}${separator}${authorStyle}`,
    });
  } else if (presentationDeclarations.length > 0) {
    const closingStart = tag.search(/\s*\/?>$/);
    replacements.push({
      start: closingStart,
      end: closingStart,
      text: ` style="${presentationDeclarations.join(";")}"`,
    });
  }

  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce((result, replacement) => {
      return `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`;
    }, tag);
}

function remapHtmlStartTags(html: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const tagStart = html.indexOf("<", cursor);
    if (tagStart === -1) return result + html.slice(cursor);
    result += html.slice(cursor, tagStart);

    if (html.startsWith("<!--", tagStart)) {
      const commentEnd = html.indexOf("-->", tagStart + 4);
      if (commentEnd === -1) return result + html.slice(tagStart);
      result += html.slice(tagStart, commentEnd + 3);
      cursor = commentEnd + 3;
      continue;
    }

    let quote: string | undefined;
    let tagEnd = tagStart + 1;
    for (; tagEnd < html.length; tagEnd += 1) {
      const character = html[tagEnd];
      if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (tagEnd >= html.length) return result + html.slice(tagStart);

    const tag = html.slice(tagStart, tagEnd + 1);
    result += /^<\s*[!/?]/.test(tag) ? tag : remapStartTag(tag);
    cursor = tagEnd + 1;

    const tagName = /^<\s*([a-z0-9:-]+)/i.exec(tag)?.[1].toLowerCase();
    if (tagName === "style" || tagName === "script") {
      const closingStart = html.toLowerCase().indexOf(`</${tagName}`, cursor);
      if (closingStart === -1) return result + html.slice(cursor);
      result += html.slice(cursor, closingStart);
      cursor = closingStart;
    }
  }

  return result;
}

/**
 * Rewrites explicit hex colors in inline style declarations to canonical
 * theme-token refs. Mappable legacy `color`/`bgcolor` hints become real
 * inline CSS because presentation attributes cannot reliably resolve `var()`.
 * Colors inside `<style>` elements, CSS classes, gradients, and URLs are
 * intentionally outside this dependency-free transform's v1 scope.
 */
export function remapColorsToTokens(html: string): string {
  return remapHtmlStartTags(html);
}
