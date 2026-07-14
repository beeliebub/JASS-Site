import { z } from "zod";
import { slugSchema } from "@/lib/validation/pages";

/**
 * Validation for admin-authored block *types* (`BlockDefinition` +
 * `BlockFieldDefinition`) and the dynamic per-instance `Block.data` schema
 * built from one. Mirrors `lib/validation/pages.ts`'s static
 * `blockDataSchemas` -- the difference is these schemas are assembled at
 * request time from rows in the database instead of being hardcoded per
 * block type.
 *
 * Kept in its own file (not folded into pages.ts) since it has nothing to do
 * with the built-in block types/pages/users domains pages.ts already covers,
 * and because `buildDataSchemaFromDefinition` is a runtime schema *factory*,
 * a different shape of export than everything else in that file.
 */

// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

export const blockFieldTypeSchema = z.enum([
  "text",
  "richText",
  "number",
  "boolean",
  "color",
  "image",
  "link",
  "select",
  "repeater",
]);
export type BlockFieldType = z.infer<typeof blockFieldTypeSchema>;

/** Every field type except `repeater` itself -- used for a repeater field's
 * own row/item fields, so "one level of nesting only" (locked decision) is a
 * structural Zod guarantee (this enum has no `repeater` member to recurse
 * into) rather than something a runtime check could forget to enforce. */
export const nonRepeaterFieldTypeSchema = z.enum([
  "text",
  "richText",
  "number",
  "boolean",
  "color",
  "image",
  "link",
  "select",
]);
export type NonRepeaterFieldType = z.infer<typeof nonRepeaterFieldTypeSchema>;

/** Same kebab-case shape as `Page`/`BlockDefinition` slugs -- reused (not
 * redefined) for every stable machine identifier in this file: a
 * `BlockDefinition.key` and a `BlockFieldDefinition.key` (top-level or
 * nested inside a repeater's own item fields) are all "one stable,
 * URL/JSON-key-safe identifier", the same shape `slugSchema` already
 * enforces. */
const fieldKeySchema = slugSchema;

// ---------------------------------------------------------------------------
// Per-field-type `config` shapes
// ---------------------------------------------------------------------------

/** text/richText/boolean/color/image fields carry no meaningful per-instance
 * settings today -- kept as (structurally) empty objects, not removed, so
 * every field type still round-trips through the same "config is always an
 * object, validated against a per-fieldType schema" shape. */
const emptyConfigSchema = z.object({});

const numberConfigSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .refine((data) => data.min === undefined || data.max === undefined || data.min <= data.max, {
    message: "min must be less than or equal to max.",
    path: ["max"],
  });

const linkConfigSchema = z.object({
  allowNewTab: z.boolean(),
});

const selectOptionSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
});

const selectConfigSchema = z
  .object({
    options: z.array(selectOptionSchema).min(1).max(50),
  })
  .refine((data) => new Set(data.options.map((o) => o.value)).size === data.options.length, {
    message: "Option values must be unique.",
    path: ["options"],
  });

/** Per-`NonRepeaterFieldType` config schema -- also the set of types valid
 * for a repeater's own item fields (see `repeaterItemFieldSchema` below). */
const nonRepeaterConfigSchemas: Record<NonRepeaterFieldType, z.ZodTypeAny> = {
  text: emptyConfigSchema,
  richText: emptyConfigSchema,
  number: numberConfigSchema,
  boolean: emptyConfigSchema,
  color: emptyConfigSchema,
  image: emptyConfigSchema,
  link: linkConfigSchema,
  select: selectConfigSchema,
};

/** One row-field of a `repeater` field's own inline item-field list --
 * structurally identical to `blockFieldDefinitionSchema` below minus the
 * ability to itself be a `repeater` (see `nonRepeaterFieldTypeSchema`). This
 * is stored inline inside the parent field's own `config` JSON (never as
 * separate `BlockFieldDefinition` rows), per the locked one-level-deep
 * decision. */
const repeaterItemFieldSchema = z
  .object({
    key: fieldKeySchema,
    label: z.string().min(1).max(200),
    fieldType: nonRepeaterFieldTypeSchema,
    order: z.number().int(),
    required: z.boolean().default(false),
    helpText: z.string().max(500).nullable().optional(),
    config: z.unknown(),
  })
  .superRefine((data, ctx) => {
    const configSchema = nonRepeaterConfigSchemas[data.fieldType];
    const parsed = configSchema.safeParse(data.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["config", ...issue.path] });
      }
    }
  });

const repeaterConfigSchema = z.object({
  fields: z.array(repeaterItemFieldSchema).min(1).max(20),
});

/** Full per-`BlockFieldType` config schema map, including `repeater`. */
const configSchemasByFieldType: Record<BlockFieldType, z.ZodTypeAny> = {
  ...nonRepeaterConfigSchemas,
  repeater: repeaterConfigSchema,
};

// ---------------------------------------------------------------------------
// Field / definition CRUD schemas
// ---------------------------------------------------------------------------

/** One field of a `BlockDefinition`. `config`'s real shape depends on
 * `fieldType`, validated via `superRefine` below (same two-stage-validation
 * idea as `blockCreateSchema`'s `data: z.unknown()` in `lib/validation/pages.ts`,
 * just resolved immediately here instead of deferred to a second route-level
 * pass, since the field type is already known at this point). */
export const blockFieldDefinitionSchema = z
  .object({
    key: fieldKeySchema,
    label: z.string().min(1).max(200),
    fieldType: blockFieldTypeSchema,
    order: z.number().int(),
    required: z.boolean().default(false),
    helpText: z.string().max(500).nullable().optional(),
    config: z.unknown(),
  })
  .superRefine((data, ctx) => {
    const configSchema = configSchemasByFieldType[data.fieldType];
    const parsed = configSchema.safeParse(data.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["config", ...issue.path] });
      }
    }
  });

/** Rejects two top-level fields sharing a `key` -- silently overwriting one
 * another as object keys inside `buildDataSchemaFromDefinition`'s `z.object`
 * shape would otherwise be a foot-gun invisible until render time. Only
 * checks the top level (not into repeater item fields) -- keeping this
 * simple is enough to catch the main risk. */
function refineUniqueFieldKeys(data: { fields?: { key: string }[] }, ctx: z.RefinementCtx) {
  if (!data.fields) return;
  const seen = new Set<string>();
  data.fields.forEach((field, index) => {
    if (seen.has(field.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", index, "key"],
        message: `Duplicate field key "${field.key}" -- each field's key must be unique within a definition.`,
      });
    }
    seen.add(field.key);
  });
}

export const blockDefinitionCreateSchema = z
  .object({
    key: slugSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(1000).nullable().optional(),
    layout: z.string().min(1).max(80),
    fields: z.array(blockFieldDefinitionSchema).max(50),
  })
  .superRefine(refineUniqueFieldKeys);

/** `key` is immutable after create (stable identifier a `Block.data` schema
 * is built against) -- deliberately absent here, unlike `pageUpdateSchema`'s
 * (mutable) `slug`. */
export const blockDefinitionUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).nullable().optional(),
    layout: z.string().min(1).max(80).optional(),
    fields: z.array(blockFieldDefinitionSchema).max(50).optional(),
  })
  .superRefine(refineUniqueFieldKeys);

// ---------------------------------------------------------------------------
// Dynamic `Block.data` schema builder
// ---------------------------------------------------------------------------

/** Shape of a field as read off a `BlockFieldDefinition` row (or an inline
 * repeater item field, once parsed) -- just enough to build its data schema. */
export type BlockDefinitionFieldLike = {
  key: string;
  fieldType: string;
  required: boolean;
  config: string;
};

type ParsedFieldLike = {
  key: string;
  fieldType: string;
  required: boolean;
  config: unknown;
};

function safeJsonParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Builds the Zod type for one field's *value* (not its `config`). Per
 * fieldType:
 * - `text`/`richText`/`color`/`link`: a plain string -- `link` stores its
 *   href directly as a string (the field's own `config.allowNewTab`
 *   controls how it's rendered/opened, not its stored shape), matching the
 *   plan's "z.string() for text/color/link-href" summary.
 * - `image`: a plain string (an uploaded/external image URL, same
 *   convention as the built-in `image` block's `src` -- full URL validation
 *   is a rendering-layer concern, not this dynamic-schema one).
 * - `number`: `z.number()`, additionally bounded by the field's own
 *   `config.min`/`config.max` when present.
 * - `boolean`: `z.boolean()`.
 * - `select`: `z.enum(...)` over the field's own configured option values
 *   when any exist (stricter than a bare string -- the definition already
 *   knows the valid set), falling back to `z.string()` if the config is
 *   somehow empty.
 * - `repeater`: `z.array(z.object({...}))`, recursively built from the
 *   field's own `config.fields` (inline item-field defs, one level deep).
 * Every field is wrapped `.optional()` unless `required`. */
function buildFieldValueSchema(field: ParsedFieldLike): z.ZodTypeAny {
  let base: z.ZodTypeAny;

  switch (field.fieldType) {
    case "text":
    case "richText":
    case "color":
    case "link":
    case "image": {
      base = z.string();
      break;
    }
    case "number": {
      const config = field.config as { min?: unknown; max?: unknown };
      let numberSchema = z.number();
      if (typeof config.min === "number") numberSchema = numberSchema.min(config.min);
      if (typeof config.max === "number") numberSchema = numberSchema.max(config.max);
      // Optional numbers additionally accept `null` ("unset", as opposed to
      // `undefined` meaning "key omitted entirely") -- same convention as
      // `imageSizeSchema`'s scale/width/height in lib/validation/pages.ts,
      // which the built-in Image block's own clear-to-empty UI relies on.
      // `defaultDataForFields` below defaults every number field to `null`
      // for exactly this reason, and NumberFieldInput's clear-the-input path
      // (components/blocks/custom-fields/number-field.tsx) sends `null` too.
      base = field.required ? numberSchema : numberSchema.nullable();
      break;
    }
    case "boolean": {
      base = z.boolean();
      break;
    }
    case "select": {
      const config = field.config as { options?: { value?: unknown }[] };
      const values = (config.options ?? [])
        .map((option) => option.value)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      base = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
      break;
    }
    case "repeater": {
      const config = field.config as { fields?: ParsedFieldLike[] };
      const itemFields = Array.isArray(config.fields) ? config.fields : [];
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const itemField of itemFields) {
        shape[itemField.key] = buildFieldValueSchema({
          key: itemField.key,
          fieldType: itemField.fieldType,
          required: Boolean(itemField.required),
          // Item-field configs live inline inside the parent's own JSON blob
          // (never separately stringified -- there's no separate DB row for
          // them), so they arrive here already parsed, unlike the top-level
          // field's own `config` string handled in
          // `buildDataSchemaFromDefinition` below.
          config: itemField.config ?? {},
        });
      }
      base = z.array(z.object(shape));
      break;
    }
    default: {
      // Unknown fieldType (e.g. a stale definition from a future version of
      // this app) -- accept anything rather than hard-fail the whole block.
      base = z.unknown();
      break;
    }
  }

  return field.required ? base : base.optional();
}

/**
 * Builds the full `z.object({...})` for a `BlockDefinition`'s `Block.data`,
 * keyed by each field's own `key`. This is what `app/api/blocks/route.ts`
 * and `app/api/blocks/[id]/route.ts` call in place of the static
 * `blockDataSchemas[type]` lookup whenever `type === "custom"`.
 */
export function buildDataSchemaFromDefinition(fields: BlockDefinitionFieldLike[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    const config = safeJsonParse(field.config);
    shape[field.key] = buildFieldValueSchema({
      key: field.key,
      fieldType: field.fieldType,
      required: field.required,
      config,
    });
  }
  return z.object(shape);
}

// ---------------------------------------------------------------------------
// Default `Block.data` for a freshly-added custom block instance
// ---------------------------------------------------------------------------

/** Default value for one field's *value* (not its `config`), by fieldType --
 * mirrors `buildFieldValueSchema`'s per-fieldType knowledge above, but
 * produces a plausible starting value instead of a Zod schema. `number`
 * defaults to `null` (not `0`) since the field may be optional and `0` is a
 * valid real value -- `null` reads unambiguously as "unset". `select`
 * defaults to its first configured option's value when any exist, since an
 * empty string wouldn't be a valid choice once options are configured. */
function defaultValueForField(field: ParsedFieldLike): unknown {
  switch (field.fieldType) {
    case "text":
    case "richText":
    case "color":
    case "link":
    case "image":
      return "";
    case "number":
      return null;
    case "boolean":
      return false;
    case "select": {
      const config = field.config as { options?: { value?: unknown }[] };
      const first = (config.options ?? []).find(
        (option): option is { value: string } => typeof option.value === "string" && option.value.length > 0,
      );
      return first ? first.value : "";
    }
    case "repeater":
      return [];
    default:
      // Unknown fieldType (e.g. a stale definition from a future version of
      // this app) -- same "don't hard-fail the whole block" stance as
      // buildFieldValueSchema's default case above.
      return null;
  }
}

/**
 * Builds the default `Block.data` object for a freshly-added instance of a
 * `BlockDefinition` -- one plain per-fieldType default per field, keyed by
 * each field's own `key`. Used both client-side (the "Add block" picker in
 * components/pages/page-blocks.tsx, computing the POST body for a new custom
 * block) and server-side (components/pages/page-renderer.tsx, as the
 * fallback when a stored `Block`'s `data` fails to parse against
 * `buildDataSchemaFromDefinition` -- the same "guard against corrupt/stale
 * rows" role `defaultBlockData` plays for built-in types in registry.tsx).
 * Kept in this file (not registry.tsx) since it needs the same per-fieldType
 * knowledge `buildFieldValueSchema` already has here, and must stay a plain
 * function with no Prisma/server-only dependency so the client-side picker
 * can import it directly.
 */
export function defaultDataForFields(fields: BlockDefinitionFieldLike[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const config = safeJsonParse(field.config);
    data[field.key] = defaultValueForField({
      key: field.key,
      fieldType: field.fieldType,
      required: field.required,
      config,
    });
  }
  return data;
}
