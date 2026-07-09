import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, unauthorized, validationError } from "@/lib/api-response";
import { featureCreateSchema } from "@/lib/validation/content";

export async function GET() {
  try {
    const features = await prisma.feature.findMany({ orderBy: { order: "asc" } });
    return apiSuccess(features);
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

  const parsed = featureCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const feature = await prisma.feature.create({ data: parsed.data });
    revalidatePath("/features");
    return apiSuccess(feature, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
