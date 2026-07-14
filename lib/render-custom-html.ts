import { renderRichTextToHtml } from "@/lib/custom-html-rich-text";
import {
  interpolateCustomHtmlTemplate,
  remapColorsToTokens,
  type CustomHtmlTemplateField,
} from "@/lib/custom-html-template";

type HtmlBlockDefinition = {
  renderMode: string;
  htmlTemplate: string | null;
  remapThemeColors: boolean;
  fields: readonly CustomHtmlTemplateField[];
};

/** Builds the one trusted HTML string returned by server render and mutation
 * paths. Keeping this in one helper prevents view mode and optimistic admin
 * updates from drifting onto different interpolation/sanitization rules. */
export function renderCustomHtml(
  definition: HtmlBlockDefinition,
  data: Readonly<Record<string, unknown>>,
): string | undefined {
  if (definition.renderMode !== "html" || !definition.htmlTemplate) return undefined;

  const interpolated = interpolateCustomHtmlTemplate(definition.htmlTemplate, definition.fields, data, {
    renderRichText: renderRichTextToHtml,
  });
  return definition.remapThemeColors ? remapColorsToTokens(interpolated) : interpolated;
}
