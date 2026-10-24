import Link from "next/link";
import { redirect } from "next/navigation";
import { serverDataEnabled } from "@/server/auth/config";
import { requireIdentity } from "@/server/auth/session";
import { PrivacyControls } from "@/features/auth/privacy-controls";
import { AccountSignOut } from "@/features/auth/account-sign-out";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  if (!serverDataEnabled()) redirect("/settings");
  await requireIdentity();
  return <main className="auth-page"><div className="auth-card account-card">
    <Link className="account-back-link" href="/settings">← Cài đặt gia đình</Link>
    <h1>Quản lý tài khoản</h1>
    <PrivacyControls />
    <section className="account-session" aria-labelledby="account-session-title">
      <h2 id="account-session-title">Phiên đăng nhập</h2>
      <p>Đăng xuất khỏi thiết bị này. Dữ liệu gia đình vẫn được giữ trong tài khoản.</p>
      <AccountSignOut />
    </section>
  </div></main>;
}
