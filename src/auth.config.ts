import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config — no Prisma imports (middleware runs in Edge runtime).
// Full config (credentials provider + Prisma lookup) ./auth.ts'de extend edilir.

// "/" and "/leaderboard" are browsable without login — the homepage shows
// PLAY/LEADERBOARD/SHOP buttons and the leaderboard is read-only. Everything
// else gated on authentication. Clicking PLAY while logged out hits /play,
// which isn't public, and the middleware bounces to /login?callbackUrl=/play.
const PUBLIC_PATHS = ["/", "/login", "/signup", "/leaderboard"];
const PUBLIC_PREFIXES = ["/api/auth", "/_next", "/favicon", "/media"];

export default {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      const isPublic =
        PUBLIC_PATHS.includes(pathname) ||
        PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

      if (isPublic) {
        // if logged-in user hits login/signup, send home
        if (isLoggedIn && (pathname === "/login" || pathname === "/signup")) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.username = (user as { username?: string }).username;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        (session.user as { username?: string }).username =
          token.username as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
