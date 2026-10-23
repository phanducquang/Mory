import Link from "next/link";
import { redirect } from "next/navigation";
import { serverDataEnabled } from "@/server/auth/config";
import { requireIdentity } from "@/server/auth/session";
import { PrivacyControls } from "@/features/auth/privacy-controls";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  if (!serverDataEnabled()) redirect("/settings");
  await requireIdentity();
  return <main className="auth-page"><div className="auth-card"><Link href="/home">← Về Mory</Link><h1>Quản lý tài khoản</h1><PrivacyControls /></div></main>;
}
