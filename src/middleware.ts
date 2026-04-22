import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Edge runtime — JWT-verify-only config, no Prisma imports.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // match everything except auth, next internals, static files
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
