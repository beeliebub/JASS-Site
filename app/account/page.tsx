import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export const metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
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
    </Container>
  );
}
