import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, internalError, unauthorized, validationError } from "@/lib/api-response";
import { getCustomThemes } from "@/lib/custom-themes";
import { customThemeCreateSchema } from "@/lib/validation/custom-themes";

export async function GET() {
  try {
    const themes = await getCustomThemes();
    return apiSuccess(themes);
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = customThemeCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const existing = await prisma.customTheme.findUnique({ where: { name: parsed.data.name } });
    if (existing) return conflict(`A custom theme named "${parsed.data.name}" already exists.`);

    const theme = await prisma.customTheme.create({ data: { ...parsed.data, createdBy: user?.email } });

    // The footer theme picker and every page's theme resolution can be
    // affected by a new custom theme, so hit the whole layout.
    revalidatePath("/", "layout");
    revalidatePath("/admin/themes");
    return apiSuccess(theme, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
