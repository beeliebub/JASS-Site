import NextAuth, { type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import { cache } from "react";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { checkIpRateLimit, checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { lookupSessionUser } from "@/lib/session-user";

const lookupAuthSessionUser = cache((id: string) => lookupSessionUser(prisma, id));

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const ip = request.headers.get("x-forwarded-for") ?? "unknown";
        const rateLimitKey = `${email.toLowerCase()}:${ip}`;

        if (!checkIpRateLimit(ip) || !checkRateLimit(rateLimitKey)) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
          return null;
        }

        resetRateLimit(rateLimitKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        return token;
      }

      if (typeof token.id !== "string" || !token.id) return null;

      const result = await lookupAuthSessionUser(token.id);
      if (result.status === "gone") return null;
      if (result.status === "unknown") {
        // A lookup failure must not make Auth.js clear every signed-in user's cookie.
        console.error("Unable to refresh the session from the live user record.", result.error);
        return token;
      }

      token.role = result.user.role;
      token.email = result.user.email;
      token.name = result.user.name;
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
