import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { prisma } from "@/lib/prisma";
import { BlockDefinitionsAdmin } from "@/components/admin/block-definitions-admin";

export const metadata = { title: "Block types — Admin" };

export default async function AdminBlockTypesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const definitions = await prisma.blockDefinition.findMany({
    include: { fields: { orderBy: { order: "asc" } }, _count: { select: { blocks: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Block types</h1>
        <p className="text-sm text-muted">
          Admin-defined block types. Each one becomes usable in the page builder&apos;s &quot;Add block&quot; picker
          right alongside the built-in types, with its own fields, layout, and config. A block type still used by a
          block on a page can&apos;t be deleted until every instance of it is removed.
        </p>
      </div>

      <BlockDefinitionsAdmin
        initialDefinitions={definitions.map((definition) => ({
          id: definition.id,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          layout: definition.layout,
          fields: definition.fields.map((field) => ({
            key: field.key,
            label: field.label,
            fieldType: field.fieldType,
            order: field.order,
            required: field.required,
            helpText: field.helpText,
            config: field.config,
          })),
          usageCount: definition._count.blocks,
        }))}
      />
    </Container>
  );
}
