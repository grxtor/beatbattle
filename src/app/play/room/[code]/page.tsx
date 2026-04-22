import AppShell from "@/components/AppShell";
import BattleRoom from "./BattleRoom";

export default async function BattleRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <AppShell showFriends={false} showRooms={false} compact>
      <BattleRoom code={code} />
    </AppShell>
  );
}
