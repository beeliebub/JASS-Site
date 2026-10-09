import type { Metadata } from "next";
import { Container } from "@/components/container";
import { LoginForm } from "@/components/auth/login-form";
import { SiteChrome } from "@/components/pages/site-chrome";
import { getPageBySlug } from "@/lib/content";
import { formatPageTitle, siteConfig } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";
import { safeNextPath } from "@/lib/safe-redirect";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("login");
  const settings = await getSiteSettings();
  return {
    title: page ? formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name) : "Login",
  };
}

type LoginPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const reauthRequired = params.reauth === "1";

  return (
    <SiteChrome theme={null} customThemeTokens={null}>
      <Container className="flex flex-1 items-center justify-center py-16">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8">
          <div className="mb-6 flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">
              Admin sign in
            </h1>
            <p className="text-sm text-pretty text-muted">
              Restricted to site administrators.
            </p>
          </div>
          {reauthRequired && (
            <p role="status" className="mb-5 text-sm text-muted">
              Your session was not accepted by the panel. Sign in again to continue.
            </p>
          )}
          <LoginForm nextPath={nextPath} />
        </div>
      </Container>
    </SiteChrome>
  );
}
