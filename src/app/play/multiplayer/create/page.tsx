import AppShell from "@/components/AppShell";
import CreateForm from "./CreateForm";

export default function CreateRoomPage() {
  return (
    <AppShell showFriends showRooms>
      <CreateForm />
    </AppShell>
  );
}
