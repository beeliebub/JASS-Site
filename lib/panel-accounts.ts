/**
 * The accounts the panel's Access screen offers for grants: every OWNER and ADMIN on this site, including accounts created before the
 * panel existed. The panel asks with the signed-in person's own cookie (app/api/panel/accounts/route.ts), so the list only reaches a
 * session that is already an admin role. It is used to choose people, never to decide what anyone may do: the panel's grant rows
 * decide that.
 */
import { prisma } from "@/lib/prisma";

export function listPanelAccounts() {
  return prisma.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, role: true },
  });
}
