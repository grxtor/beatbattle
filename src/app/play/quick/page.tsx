import AppShell from "@/components/AppShell";
import QuickMatch from "./QuickMatch";

export default function QuickPlayPage() {
  return (
    <AppShell showFriends showRooms>
      <QuickMatch />
    </AppShell>
  );
}
