import LoginForm from "./LoginForm";
import { getOAuthProviders } from "@/lib/oauth";

export default function LoginPage() {
  const providers = getOAuthProviders()
    .filter((p) => p.enabled)
    .map((p) => ({ id: p.id, label: p.label, mark: p.mark }));

  return <LoginForm providers={providers} mode="login" />;
}
