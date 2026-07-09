"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/admin/toast";
import { DeleteButton } from "@/components/admin/list-controls";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN";
  createdAt: string;
};

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function CreateUserForm({ onSubmit }: { onSubmit: (values: { email: string; password: string; name: string; role: "OWNER" | "ADMIN" }) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN">("ADMIN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit({ email, password, name, role });
      setEmail("");
      setPassword("");
      setName("");
      setRole("ADMIN");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setSaving(false);
    }
  }

  const fieldClassName =
    "h-10 rounded-md border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none focus-visible:border-primary";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-dashed border-primary/60 bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClassName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">Temp password</label>
          <input required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClassName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClassName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as "OWNER" | "ADMIN")} className={fieldClassName}>
            <option value="ADMIN">ADMIN</option>
            <option value="OWNER">OWNER</option>
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="flex h-10 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}

export function UsersAdmin({ initialUsers, currentUserId }: { initialUsers: AdminUser[]; currentUserId: string }) {
  const { showError, showSuccess } = useToast();
  const [users, setUsers] = useState(initialUsers);

  const ownerCount = users.filter((u) => u.role === "OWNER").length;

  async function createUser(values: { email: string; password: string; name: string; role: "OWNER" | "ADMIN" }) {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: values.email, password: values.password, name: values.name || undefined, role: values.role }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to create user."));
    const { data } = (await res.json()) as { data: AdminUser };
    setUsers((prev) => [...prev, data]);
    showSuccess(`${data.email} created.`);
  }

  async function changeRole(user: AdminUser, role: "OWNER" | "ADMIN") {
    const previous = users;
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to update role."));
    } catch (error) {
      setUsers(previous);
      showError(error instanceof Error ? error.message : "Failed to update role.");
    }
  }

  async function deleteUser(user: AdminUser) {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${user.email}?`)) return;
    const previous = users;
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete user."));
    } catch (error) {
      setUsers(previous);
      showError(error instanceof Error ? error.message : "Failed to delete user.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const isLastOwner = user.role === "OWNER" && ownerCount <= 1;
              const roleLocked = isSelf || isLastOwner;
              return (
                <tr key={user.id} className="bg-surface">
                  <td className="px-4 py-3 text-foreground">{user.email}</td>
                  <td className="px-4 py-3 text-muted">{user.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={roleLocked}
                      onChange={(e) => changeRole(user, e.target.value as "OWNER" | "ADMIN")}
                      title={isSelf ? "You can't change your own role." : isLastOwner ? "Can't demote the last OWNER." : undefined}
                      className="h-8 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="OWNER">OWNER</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{new Date(user.createdAt).toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteButton
                      label="Delete user"
                      disabled={isSelf || isLastOwner}
                      onClick={() => deleteUser(user)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateUserForm onSubmit={createUser} />
    </div>
  );
}
