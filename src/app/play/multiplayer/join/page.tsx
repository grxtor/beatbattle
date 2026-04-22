import AppShell from "@/components/AppShell";
import JoinForm from "./JoinForm";

export default function JoinRoomPage() {
  return (
    <AppShell showFriends showRooms>
      <JoinForm />
    </AppShell>
  );
}
