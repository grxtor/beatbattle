import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";

import authConfig from "./auth.config";
import { prisma } from "./lib/prisma";
import { RATE_LIMITS, clientIpFrom, rateLimit } from "./lib/rateLimit";

const credentialsSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(6).max(72),
});

// A bcrypt hash of a random throwaway secret. Used as a decoy so that
// non-existent usernames and wrong passwords spend the same time - avoids
// leaking user existence via response timing.
const DUMMY_HASH =
  "$2b$10$abcdefghijklmnopqrstuuIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

async function readSessionUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      sessionVersion: true,
    },
  });
}

// OAuth providers are wired conditionally. Set these env vars to enable:
//   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
//   GOOGLE_CLIENT_ID  / GOOGLE_CLIENT_SECRET
const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      username: { label: "Username" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { username, password } = parsed.data;
      const u = username.toLowerCase().trim();

      // Rate-limit by IP + username so one abuser can't hammer every account.
      const ip = clientIpFrom(request?.headers ?? new Headers());
      const limit = await rateLimit(`login:${ip}:${u}`, RATE_LIMITS.loginAttempt);
      if (!limit.ok) return null;

      const user = await prisma.user.findUnique({
        where: { username: u },
        select: { id: true, username: true, passwordHash: true },
      });

      // Always run bcrypt - either against the real hash or a dummy one -
      // so timing doesn't disclose whether the username exists.
      const hash = user?.passwordHash ?? DUMMY_HASH;
      const ok = await bcrypt.compare(password, hash);
      if (!user?.passwordHash || !ok) return null;

      return { id: user.id, username: user.username, name: user.username };
    },
  }),
];

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  providers.push(
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  );
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  // Prisma adapter persists linked OAuth accounts to the Account table.
  // Sessions stay in JWT (adapter is compatible with JWT strategy).
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      const userId =
        (user as { id?: string } | undefined)?.id ??
        (typeof token.sub === "string" ? token.sub : undefined);
      if (!userId) return token;

      const dbUser = await readSessionUser(userId);
      if (!dbUser) return null;

      const tokenSessionVersion =
        typeof token.sessionVersion === "number" ? token.sessionVersion : 0;

      if (
        trigger !== "signIn" &&
        trigger !== "signUp" &&
        trigger !== "update" &&
        tokenSessionVersion !== dbUser.sessionVersion
      ) {
        return null;
      }

      token.sub = dbUser.id;
      token.username = dbUser.username;
      token.sessionVersion = dbUser.sessionVersion;

      if (trigger === "signIn" || trigger === "signUp") {
        token.authenticatedAt = Date.now();
        return token;
      }

      if (trigger === "update") {
        const nextAuthenticatedAt = (session as { authenticatedAt?: unknown })
          ?.authenticatedAt;
        if (
          typeof nextAuthenticatedAt === "number" &&
          Number.isFinite(nextAuthenticatedAt)
        ) {
          token.authenticatedAt = nextAuthenticatedAt;
        }
      }

      if (
        typeof token.authenticatedAt !== "number" ||
        !Number.isFinite(token.authenticatedAt)
      ) {
        const issuedAt = (token as { iat?: unknown }).iat;
        token.authenticatedAt =
          typeof issuedAt === "number" && Number.isFinite(issuedAt)
            ? issuedAt * 1000
            : 0;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.username =
          typeof token.username === "string" ? token.username : "";
      }
      session.sessionVersion =
        typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      session.authenticatedAt =
        typeof token.authenticatedAt === "number" ? token.authenticatedAt : 0;
      return session;
    },
  },
});
