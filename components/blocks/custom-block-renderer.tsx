"use client";

import type { ComponentType } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { Container } from "@/components/container";
import type { BlockLayoutTemplateId } from "@/lib/block-layouts";
import { CustomFieldInput } from "@/components/blocks/custom-fields/field-input";
import type { BlockDefinitionWithFields, CustomFieldDef } from "@/components/blocks/custom-fields/types";

/**
 * Renders one instance of an admin-authored `BlockDefinition` per its
 * `layout`. There's no per-field "which slot" assignment in the schema yet
 * (a later, explicitly-deferred phase) -- each template below guesses which
 * fields fit its own fixed visual slots by `fieldType` (first `image` field
 * is "the media", first `text` field is "the heading", etc.). Anything that
 * doesn't match a template's expected shape still renders, in a generic
 * labeled fallback section -- a field is never silently dropped just because
 * a template didn't have a slot shaped for it.
 *
 * Never wraps itself in BlockShell -- components/pages/page-blocks.tsx
 * already wraps every block's rendered output in one BlockShell centrally
 * (see components/blocks/block-shell.tsx's doc comment); doing it again here
 * would double the move/delete chrome. The edit-mode/visitor split is
 * handled per-field instead, by each field-input component's own
 * `showEditable` check (components/blocks/custom-fields/*).
 */

type TemplateProps = {
  fields: CustomFieldDef[];
  data: Record<string, unknown>;
  onFieldChange: (key: string, next: unknown) => Promise<void>;
};

function FieldSlot({
  field,
  data,
  onFieldChange,
  showLabel = true,
  layoutHint,
}: {
  field: CustomFieldDef;
  data: Record<string, unknown>;
  onFieldChange: (key: string, next: unknown) => Promise<void>;
  showLabel?: boolean;
  layoutHint?: "list" | "grid";
}) {
  return (
    <CustomFieldInput
      field={field}
      value={data[field.key]}
      onChange={(next) => onFieldChange(field.key, next)}
      showLabel={showLabel}
      layoutHint={layoutHint}
    />
  );
}

/** Generic fallback section -- every field a template's own slots didn't
 * claim renders here, label + its own field-input component, same rendering
 * StackedTemplate gives every field. */
function FallbackFields({
  fields,
  data,
  onFieldChange,
  className = "mt-4 flex flex-col gap-4",
}: {
  fields: CustomFieldDef[];
  data: Record<string, unknown>;
  onFieldChange: (key: string, next: unknown) => Promise<void>;
  className?: string;
}) {
  if (fields.length === 0) return null;
  return (
    <div className={className}>
      {fields.map((field) => (
        <FieldSlot key={field.key} field={field} data={data} onFieldChange={onFieldChange} />
      ))}
    </div>
  );
}

/** Picks the first field of each slot-shaped type (image -> media, text ->
 * heading, richText -> body, link -> button) and returns both the picks and
 * the leftover fields none of those slots claimed. Shared by
 * BannerTemplate/SplitTemplate -- the two templates whose slot heuristic is
 * identical, only their arrangement (stacked vs. side-by-side) differs. */
function pickHeroSlots(fields: CustomFieldDef[]) {
  const mediaField = fields.find((f) => f.fieldType === "image");
  const headingField = fields.find((f) => f.fieldType === "text");
  const bodyField = fields.find((f) => f.fieldType === "richText");
  const buttonField = fields.find((f) => f.fieldType === "link");
  const claimedKeys = new Set(
    [mediaField?.key, headingField?.key, bodyField?.key, buttonField?.key].filter(
      (key): key is string => Boolean(key),
    ),
  );
  const remaining = fields.filter((f) => !claimedKeys.has(f.key));
  return { mediaField, headingField, bodyField, buttonField, remaining };
}

/** The safest default for any mix of fields, and every definition's implicit
 * fallback for an unrecognized `layout` string: every field, in order, top
 * to bottom, via its own field-input component and label. */
function StackedTemplate({ fields, data, onFieldChange }: TemplateProps) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <FieldSlot key={field.key} field={field} data={data} onFieldChange={onFieldChange} />
      ))}
    </div>
  );
}

/** A large full-width media/heading area, supporting text, and an optional
 * button below it -- all centered, stacked vertically. */
function BannerTemplate({ fields, data, onFieldChange }: TemplateProps) {
  const { mediaField, headingField, bodyField, buttonField, remaining } = pickHeroSlots(fields);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {mediaField && <FieldSlot field={mediaField} data={data} onFieldChange={onFieldChange} showLabel={false} />}
      {headingField && (
        <div className="text-2xl font-semibold text-foreground sm:text-3xl">
          <FieldSlot field={headingField} data={data} onFieldChange={onFieldChange} showLabel={false} />
        </div>
      )}
      {bodyField && (
        <div className="max-w-2xl">
          <FieldSlot field={bodyField} data={data} onFieldChange={onFieldChange} showLabel={false} />
        </div>
      )}
      {buttonField && <FieldSlot field={buttonField} data={data} onFieldChange={onFieldChange} showLabel={false} />}
      <FallbackFields fields={remaining} data={data} onFieldChange={onFieldChange} className="mt-2 flex w-full flex-col gap-4 text-left" />
    </div>
  );
}

/** Media on one side, heading/body/button stacked on the other. */
function SplitTemplate({ fields, data, onFieldChange }: TemplateProps) {
  const { mediaField, headingField, bodyField, buttonField, remaining } = pickHeroSlots(fields);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-6 sm:flex-row">
        <div className="w-full sm:w-1/2">
          {mediaField && <FieldSlot field={mediaField} data={data} onFieldChange={onFieldChange} showLabel={false} />}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-1/2">
          {headingField && (
            <div className="text-xl font-semibold text-foreground sm:text-2xl">
              <FieldSlot field={headingField} data={data} onFieldChange={onFieldChange} showLabel={false} />
            </div>
          )}
          {bodyField && <FieldSlot field={bodyField} data={data} onFieldChange={onFieldChange} showLabel={false} />}
          {buttonField && <FieldSlot field={buttonField} data={data} onFieldChange={onFieldChange} showLabel={false} />}
        </div>
      </div>
      <FallbackFields fields={remaining} data={data} onFieldChange={onFieldChange} />
    </div>
  );
}

/** A repeater field's rows as a responsive grid of cards instead of a
 * stacked list -- everything else on the definition still renders below it,
 * same fallback rule as every other template. */
function RepeaterGridTemplate({ fields, data, onFieldChange }: TemplateProps) {
  const gridField = fields.find((f) => f.fieldType === "repeater");
  const remaining = fields.filter((f) => f.key !== gridField?.key);

  return (
    <div className="flex flex-col gap-4">
      {gridField && <FieldSlot field={gridField} data={data} onFieldChange={onFieldChange} layoutHint="grid" />}
      <FallbackFields fields={remaining} data={data} onFieldChange={onFieldChange} />
    </div>
  );
}

const LAYOUT_TEMPLATES: Record<BlockLayoutTemplateId, ComponentType<TemplateProps>> = {
  stacked: StackedTemplate,
  banner: BannerTemplate,
  split: SplitTemplate,
  repeaterGrid: RepeaterGridTemplate,
};

export function CustomBlockRenderer({
  definition,
  data,
  onSaveData,
}: {
  definition: BlockDefinitionWithFields;
  data: Record<string, unknown>;
  onSaveData: (next: Record<string, unknown>) => Promise<void>;
}) {
  const sortedFields = [...definition.fields].sort((a, b) => a.order - b.order);
  // Unrecognized `layout` (e.g. a definition edited outside the admin UI, or
  // a future template id from a newer version of this app) -- fall back to
  // the simplest template defensively rather than crash the page.
  const Template = LAYOUT_TEMPLATES[definition.layout as BlockLayoutTemplateId] ?? StackedTemplate;

  function onFieldChange(key: string, next: unknown) {
    return onSaveData({ ...data, [key]: next });
  }

  return (
    <Container className="py-6 sm:py-8">
      <Template fields={sortedFields} data={data} onFieldChange={onFieldChange} />
    </Container>
  );
}

/** Shown in place of a `"custom"` block whose `blockDefinitionId` no longer
 * resolves to a real `BlockDefinition` (e.g. deleted) -- shouldn't be
 * reachable given the delete guard on `DELETE /api/block-definitions/[id]`
 * (rejects while any block still uses it), but a page could in principle
 * still hold a stale reference. Silent for visitors; a small notice for
 * admins so the dangling block is at least discoverable -- it can only be
 * removed via BlockShell's own delete control, rendered a level up in
 * page-blocks.tsx, since there's no field data here to edit. */
export function MissingBlockDefinitionNotice() {
  const { isAdmin } = useEditMode();
  if (!isAdmin) return null;
  return (
    <Container className="py-6 sm:py-8">
      <p className="text-sm italic text-muted">This block&apos;s type no longer exists.</p>
    </Container>
  );
}
