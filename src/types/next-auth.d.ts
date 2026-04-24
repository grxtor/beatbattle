import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
    };
    sessionVersion: number;
    authenticatedAt: number;
  }

  interface User {
    id: string;
    username?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    username?: string;
    sessionVersion?: number;
    authenticatedAt?: number;
  }
}
