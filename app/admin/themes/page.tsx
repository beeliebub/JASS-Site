import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { getCustomThemes } from "@/lib/custom-themes";
import { CustomThemesAdmin } from "@/components/admin/custom-themes-admin";

export const metadata = { title: "Themes — Admin" };

export default async function AdminThemesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const themes = await getCustomThemes();

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Themes</h1>
        <p className="text-sm text-muted">
          Create custom color themes from scratch. Once saved, a theme is selectable anywhere a built-in theme is
          today — the visitor-facing footer picker, and the per-page theme override in{" "}
          <span className="text-foreground">/admin/pages</span>.
        </p>
      </div>

      <CustomThemesAdmin initialThemes={themes} />
    </Container>
  );
}
