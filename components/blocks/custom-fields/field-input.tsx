"use client";

import type { ComponentType } from "react";
import type { CustomFieldDef, CustomFieldInputProps } from "@/components/blocks/custom-fields/types";
import { TextFieldInput } from "@/components/blocks/custom-fields/text-field";
import { RichTextFieldInput } from "@/components/blocks/custom-fields/rich-text-field";
import { NumberFieldInput } from "@/components/blocks/custom-fields/number-field";
import { BooleanFieldInput } from "@/components/blocks/custom-fields/boolean-field";
import { ColorFieldInput } from "@/components/blocks/custom-fields/color-field";
import { ImageFieldInput } from "@/components/blocks/custom-fields/image-field";
import { LinkFieldInput } from "@/components/blocks/custom-fields/link-field";
import { SelectFieldInput } from "@/components/blocks/custom-fields/select-field";
import { RepeaterFieldInput } from "@/components/blocks/custom-fields/repeater-field";

/**
 * fieldType -> input component lookup ("a lookup object, not a long
 * if/switch", same convention as registry.tsx's own `blockComponents`).
 * Every field of a custom block instance -- top-level, or nested one level
 * inside a `repeater` field's own item fields -- renders through this single
 * dispatcher, so layout templates (custom-block-renderer.tsx) and
 * RepeaterFieldInput's row rendering never need their own per-fieldType
 * branching.
 *
 * This file and repeater-field.tsx import each other (a repeater row renders
 * its own item fields via this dispatcher; the "repeater" entry in the
 * lookup below is RepeaterFieldInput itself). The lookup object is built
 * *inside* the component function, not at module top level, so it's only
 * ever constructed after both modules have fully finished loading --
 * sidestepping any ES-module circular-import evaluation-order question
 * entirely, rather than relying on function-declaration hoisting to resolve
 * it safely.
 */
export function CustomFieldInput(props: CustomFieldInputProps) {
  const fieldInputComponents: Record<CustomFieldDef["fieldType"], ComponentType<CustomFieldInputProps>> = {
    text: TextFieldInput,
    richText: RichTextFieldInput,
    number: NumberFieldInput,
    boolean: BooleanFieldInput,
    color: ColorFieldInput,
    image: ImageFieldInput,
    link: LinkFieldInput,
    select: SelectFieldInput,
    repeater: RepeaterFieldInput,
  };
  const Component = fieldInputComponents[props.field.fieldType];
  if (!Component) return null;
  return <Component {...props} />;
}
