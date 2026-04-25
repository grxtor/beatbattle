import Link from "next/link";
import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import { UnsavedChangesProvider } from "@/components/UnsavedChanges";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import DangerZone from "./DangerZone";
import LinkedAccounts from "./LinkedAccounts";
import PasswordForm from "./PasswordForm";
import PrivacyToggles from "./PrivacyToggles";
import ProfileForm from "./ProfileForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const OAUTH_PROVIDERS = [
  { id: "discord", label: "DISCORD", enabled: !!process.env.DISCORD_CLIENT_ID },
  // Google temporarily disabled. Flip to `!!process.env.GOOGLE_CLIENT_ID` to re-enable.
  { id: "google", label: "GOOGLE", enabled: false },
] as const;

export default async function SettingsPage() {
  const me = await requireUser();
  const [accounts, credentials] = await Promise.all([
    prisma.account.findMany({
      where: { userId: me.id },
      select: { provider: true, providerAccountId: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { passwordHash: true },
    }),
  ]);

  const linkedProviders = new Set(accounts.map((account) => account.provider));
  const hasPassword = !!credentials.passwordHash;
  const providerRows = OAUTH_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    enabled: provider.enabled,
    linked: linkedProviders.has(provider.id),
  }));
  const reauthProviders = providerRows
    .filter((provider) => provider.linked && provider.enabled)
    .map(({ id, label }) => ({ id, label }));

  return (
    <AppShell active="profile" showFriends showRooms>
      <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
          <UnsavedChangesProvider>
            <div className={styles.head}>
              <Link href="/profile" className={styles.backLink}>
                {"<- BACK"}
              </Link>
              <h1 className={styles.title}>
                SETT<span>INGS</span>
              </h1>
              <span />
            </div>

            <Sketch variant={2} className={styles.section}>
              <div className={styles.sectionTitle}>PROFILE</div>
              <ProfileForm
                username={me.username}
                initials={me.initials}
                bio={me.bio ?? ""}
              />
            </Sketch>

            <Sketch variant={3} className={styles.section}>
              <div className={styles.sectionTitle}>PRIVACY</div>
              <PrivacyToggles
                acceptFriendRequests={me.acceptFriendRequests}
                showOnLeaderboard={me.showOnLeaderboard}
                discoverable={me.discoverable}
              />
            </Sketch>

            <Sketch variant={1} className={styles.section}>
              <div className={styles.sectionTitle}>LINKED ACCOUNTS</div>
              <LinkedAccounts providers={providerRows} />
            </Sketch>

            <Sketch variant={2} className={styles.section}>
              <div className={styles.sectionTitle}>PASSWORD</div>
              <PasswordForm hasPassword={hasPassword} />
            </Sketch>

            <Sketch variant={3} className={styles.section}>
              <div className={styles.sectionTitle}>DANGER ZONE</div>
              <DangerZone
                hasPassword={hasPassword}
                username={me.username}
                reauthProviders={reauthProviders}
              />
            </Sketch>
          </UnsavedChangesProvider>
        </div>
      </Sketch>
    </AppShell>
  );
}
