import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import type { OrgRole } from "@/app/generated/prisma/enums";

declare module "next-auth" {
  interface User {
    organizationId: string;
    organizationName: string;
    role: OrgRole;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      organizationId: string;
      organizationName: string;
      role: OrgRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    organizationId: string;
    organizationName: string;
    role: OrgRole;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: { organization: true },
        });
        if (!user || user.status !== "ACTIVE") return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }): Promise<JWT> => {
      if (user) {
        token.userId = user.id as string;
        token.organizationId = user.organizationId;
        token.organizationName = user.organizationName;
        token.role = user.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.userId;
      session.user.organizationId = token.organizationId;
      session.user.organizationName = token.organizationName;
      session.user.role = token.role;
      return session;
    },
  },
});
