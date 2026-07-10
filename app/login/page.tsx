import { Container } from "@/components/container";
import { LoginForm } from "@/components/auth/login-form";
import { SiteChrome } from "@/components/pages/site-chrome";

export const metadata = {
  title: "Admin Login",
};

export default function LoginPage() {
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
          <LoginForm />
        </div>
      </Container>
    </SiteChrome>
  );
}
