---
name: typescript-coding-standards
description: TypeScript conventions for this project — naming, type design, discriminated unions, Zod schema style, error handling, async discipline, and module layout for a strict-mode Next.js 16 codebase with no test runner and no DI framework. Use when writing or reviewing TypeScript in this repo.
metadata:
  origin: JASS
---

# TypeScript Coding Standards (JASS)

You apply consistent, modern TypeScript conventions to this codebase. There is **no DI framework, no
state-management library, and no test runner** here — dependencies are plain module imports, and
Next.js is the only framework in play. This skill covers general TypeScript style; defer to
`jass-stack-pro` for anything specific to Next.js 16, Prisma 7, Auth.js v5, or the block system, and
to the generic `coding-standards` skill only for conventions neither of those covers.

## When to Use

- Writing or reviewing any `.ts`/`.tsx` file in this repo
- Designing a type, a Zod schema, or a discriminated union
- Deciding where a helper belongs and what it should be named
- Reviewing error handling, async code, or module boundaries

## Core Principles

- **Prefer clarity over cleverness.** A named intermediate beats a dense chain.
- **Make illegal states unrepresentable** where it is cheap to do so — a union of literals beats a
  `string` plus a runtime check, and `Record<Union, T>` beats a loose object, because the compiler
  then reminds the next person.
- **Parse at the boundary, trust inside.** Every request body goes through a Zod schema; downstream
  code works with the parsed type, not with `unknown`.
- **`strict` mode is on and stays on.** Never reach for `any`, `@ts-ignore`, `@ts-expect-error`, or a
  non-null assertion to make an error disappear. If the type is wrong, fix the type.
- **Comments explain why, not what.** This codebase's comments carry real design rationale (see
  `lib/auth-guard.ts`, `lib/routes.ts`, `prisma/schema.prisma`). Match that. Never reference reviews,
  agents, or planning documents in a shipped comment — it has to stand on its own.

## Naming

```ts
// PASS: types and components in PascalCase
type ResolvedSiteSettings = { … };
export function PageRenderer({ page }: { page: PageWithBlocks }) { … }

// PASS: functions/variables in camelCase; predicates read as questions
export function isAdminRole(role: string | undefined | null): boolean { … }
export async function requireEditingEnabled(): Promise<boolean> { … }

// PASS: module-level constants in UPPER_SNAKE_CASE
const SHA1_RE = /^[a-f0-9]{40}$/;
const PRISMA_RECORD_NOT_FOUND = "P2025";

// PASS: schemas suffixed *Schema; snapshot helpers suffixed *Snapshot;
// admin editors named <area>-admin.tsx; block components named <type>-block.tsx
export const pageCreateSchema = z.object({ … });
export function blockSnapshot(row: Block) { … }
```

Match the closest sibling before inventing a new suffix. `require*` means "returns a boolean gate",
`get*` means "reads and resolves", `parse*` means "validates and may fail".

## Type Design

```ts
// PASS: a literal union as the single source of truth, with the type derived from it
export const BLOCK_TYPES = ["hero", "ruleList", /* … */] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// PASS: Record<Union, T> so the compiler enforces completeness
export const blockTypeLabels: Record<BlockType, string> = { … };

// PASS: `satisfies` to keep literal inference AND get exhaustiveness
export const blockDataSchemas = { … } as const satisfies Record<BlockType, z.ZodTypeAny>;

// PASS: result unions instead of throwing for expected failures
export type UndoOutcome = { ok: true } | { ok: false; message: string };
```

Prefer `type` over `interface` for data shapes here (the codebase is consistent about this). Reserve
`enum` for Prisma-generated enums; use `as const` arrays for everything else.

**When you add a member to a literal union, find every place that union is consumed.** Most consumers
are `Record<Union, …>` and the compiler will point at them. Hand-written consumers — a
`z.discriminatedUnion`, a `switch`, an array of members — will not error. Those are the ones to grep
for.

## Zod (v4)

```ts
// PASS: bound every string; nullable and optional are different statements
z.object({
  heading: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),   // may be absent
  theme: themeSchema.nullable(),                   // present, explicitly "none"
});

// PASS: cross-field rules via refine/superRefine with a clear path
.superRefine((value, ctx) => {
  if (value.renderMode === "html" && !value.htmlTemplate) {
    ctx.addIssue({ code: "custom", path: ["htmlTemplate"], message: "…" });
  }
});

// PASS: safeParse at the boundary, never parse-and-throw in a route handler
const parsed = pageCreateSchema.safeParse(body);
if (!parsed.success) return validationError(parsed.error);
```

- v4, not v3: it is `error.issues`, not `error.errors`.
- Every user-supplied string needs a `max()`. An unbounded text field is a storage-abuse surface.
- Two-stage validation is an established pattern here: validate the envelope statically, then build
  and apply the real schema once the referenced row is fetched (`buildDataSchemaFromDefinition`).
- Keep schemas in `lib/validation/**`, not inline in a route handler, so the read path can reuse them.

## Error Handling

```ts
// PASS: narrow the unknown, check the code you actually mean
try {
  await prisma.resourcePack.delete({ where: { id: pack.id } });
} catch (error) {
  if ((error as { code?: string }).code !== PRISMA_RECORD_NOT_FOUND) throw error;
}

// PASS: preserve the cause when wrapping
throw new Error("Could not load page data", { cause: error });

// FAIL: swallowing a write failure
try {
  await prisma.page.update({ … });
} catch {
  // nothing — the admin is told it saved
}
```

- Tolerate a specific error code, never a whole class. `catch { }` that ignores everything hides the
  one failure you needed to see.
- Inside a `prisma.$transaction` callback, **throw** — returning a failure-shaped value commits the
  transaction. `undoAuditEntryOrThrow` exists for exactly this reason.
- Route handlers report through `lib/api-response.ts` (`badRequest`, `notFound`, `conflict`,
  `validationError`, `internalError`), never with an ad-hoc `NextResponse.json`.
- Fallback-on-read is fine and established (a corrupt row must not crash a visitor's page). Never
  write a fallback value back to the database.

## Async Discipline

```ts
// PASS: independent reads issued together
const [ruleSections, features, posts] = await Promise.all([ … ]);

// PASS: skip the round trip entirely when there is nothing to fetch
ruleListBlockIds.length ? getRuleSectionsByBlockIds(ruleListBlockIds) : Promise.resolve([]),
```

- No floating promises. Every async call is awaited or deliberately handled.
- Batch by id (`where: { blockId: { in: ids } }`) and group in memory; never query inside a `.map()`.
- Sequential `await`s are only correct when the second genuinely depends on the first.

## Modules & Layout

- `lib/<concern>.ts` owns one cross-cutting rule and opens with a doc comment stating its contract.
- `lib/validation/<domain>.ts` owns that domain's schemas.
- `app/api/<resource>/route.ts` and `.../[id]/route.ts` own the HTTP surface only — logic lives in
  `lib/`.
- `components/<area>/<name>.tsx`, one component per file, with `"use client"` on the interactive leaf
  rather than on a whole subtree.
- **The server/client boundary is a hard constraint, not a preference.** A module a client component
  imports must not reach `lib/prisma.ts`. When a helper is needed on both sides, split it into a
  Prisma-free module (`lib/routes.ts` is the precedent).
- Split a module when it starts owning unrelated jobs, not at a line count.

## React & TSX Conventions

```tsx
// PASS: props typed inline for small components, as a named type when reused
export function Container({ children }: { children: ReactNode }) { … }

// PASS: derive, don't duplicate state
const tagIdSet = new Set(tagIds);
```

- Server components fetch and pass plain serializable props; convert `Date` to a string at the
  boundary.
- Client components own interactivity, local UI state, and optimistic updates — and every optimistic
  update needs a rollback to the last **server-confirmed** value.
- Keep keys stable and meaningful (`block.id`), never the array index for reorderable lists.

## Verification, Not Tests

There is no test runner in this project. Do not write `*.test.ts` files or reference `npm test`; the
verification loop is:

```bash
node --no-turbofan node_modules/typescript/lib/tsc.js --noEmit
node --no-turbofan node_modules/eslint/bin/eslint.js
npm run build     # when the change touches routing or the server/client boundary
```

Plus a manual walkthrough against `npm run dev`. That constraint is a reason to lean *harder* on the
type system: exhaustive `Record`s, literal unions, and `satisfies` are the closest thing this repo has
to a regression suite.
