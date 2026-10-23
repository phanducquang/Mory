import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/auth-form";
import { readAuthConfig, serverDataEnabled } from "@/server/auth/config";
export const dynamic = "force-dynamic";
export default function RegisterPage() {
  if (!serverDataEnabled() || !readAuthConfig().allowSignup) redirect("/login");
  return <AuthForm emailEnabled={readAuthConfig().emailEnabled} registerAccount allowSignup />;
}
