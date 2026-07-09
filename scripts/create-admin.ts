import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/app/generated/prisma/client";

function usage(): never {
  console.error(
    "Usage: npm run create-admin -- <email> <password> [--role OWNER|ADMIN]\n" +
      "   or: ADMIN_EMAIL=<email> ADMIN_PASSWORD=<password> ADMIN_ROLE=<OWNER|ADMIN> npm run create-admin\n" +
      "Role defaults to ADMIN if omitted. The first bootstrapped account for a\n" +
      "fresh deploy should be created with --role OWNER.",
  );
  process.exit(1);
}

function parseRole(raw: string | undefined): Role {
  if (!raw) return "ADMIN";
  const upper = raw.toUpperCase();
  if (upper === "OWNER" || upper === "ADMIN") return upper;
  console.error(`Invalid role "${raw}" -- must be OWNER or ADMIN.`);
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);

  let roleFlag: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--role") {
      roleFlag = argv[i + 1];
      i++;
    } else {
      positional.push(argv[i]);
    }
  }

  const [argEmail, argPassword] = positional;
  const email = argEmail ?? process.env.ADMIN_EMAIL;
  const password = argPassword ?? process.env.ADMIN_PASSWORD;
  const role = parseRole(roleFlag ?? process.env.ADMIN_ROLE);

  if (!email || !password) {
    usage();
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters long.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, role },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      role,
    },
  });

  console.log(`${role} user ready: ${user.email} (id: ${user.id})`);
}

main()
  .catch((error) => {
    console.error("Failed to create admin user:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
