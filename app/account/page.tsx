import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Container } from "@/components/container";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { SiteChrome } from "@/components/pages/site-chrome";
import { getPageBySlug } from "@/lib/content";
import { formatPageTitle, siteConfig } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("account");
  const settings = await getSiteSettings();
  return {
    title: page ? formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name) : "Account",
  };
}

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SiteChrome theme={null} customThemeTokens={null}>
      <Container className="flex flex-1 flex-col gap-8 py-16">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Account
          </h1>
          <p className="text-sm text-muted">
            Signed in as <span className="text-foreground">{session.user.email}</span>.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Change password</h2>
          <div className="mt-3">
            <ChangePasswordForm />
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="flex h-10 items-center justify-center rounded-md border border-border-strong px-4 text-sm font-medium text-foreground transition hover:bg-surface-2 motion-safe:active:scale-[0.97]"
          >
            Sign out
          </button>
        </form>
      </Container>
    </SiteChrome>
  );
}
