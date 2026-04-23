import type { NextAuthConfig } from "next-auth";

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
      const isLoginPage = pathname === "/login";
      const isSignupPage = pathname === "/signup";
      const isReauth = isLoginPage && nextUrl.searchParams.has("callbackUrl");

      const isPublic =
        PUBLIC_PATHS.includes(pathname) ||
        PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

      if (isPublic) {
        if (isLoggedIn && (isSignupPage || (isLoginPage && !isReauth))) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
