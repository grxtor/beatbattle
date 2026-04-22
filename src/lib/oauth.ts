/** OAuth providers available for login/signup. Mirrors providers wired in
 *  NextAuth config; an entry is `enabled` only if its env credentials exist. */
export type OAuthProvider = {
  id: "discord" | "google";
  label: string;
  mark: string;
  enabled: boolean;
};

export function getOAuthProviders(): OAuthProvider[] {
  return [
    {
      id: "discord",
      label: "DISCORD",
      mark: "D",
      enabled: !!process.env.DISCORD_CLIENT_ID,
    },
    {
      id: "google",
      label: "GOOGLE",
      mark: "G",
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
  ];
}
