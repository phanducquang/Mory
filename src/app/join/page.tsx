import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverDataEnabled, readAuthConfig } from "@/server/auth/config";
import { getServerRuntime } from "@/server/runtime";
import { JoinFamily } from "@/features/family/join-family";
import { SessionBoundary } from "@/features/auth/session-boundary";
export const dynamic = "force-dynamic";
export default async function JoinPage() {
  if (!serverDataEnabled()) redirect("/home");
  const { auth, db } = getServerRuntime();
  const identity = await auth.api.getSession({ headers: await headers() });
  const active = identity && await db.user.findFirst({ where: { id: identity.user.id, deletionRequestedAt: null }, select: { id: true } });
  const needsVerification = !!active && !!readAuthConfig().emailEnabled && !identity?.user.emailVerified;
  return <main className="auth-page"><div className="auth-card account-card">
    <SessionBoundary />
    <Link className="account-back-link" href="/home">← Tổ ấm</Link>
    <h1>Tham gia gia đình</h1>
    <p>Dùng tài khoản riêng để cùng lưu lại hành trình của con. Tham gia không chuyển hay gộp dữ liệu gia đình khác của bạn.</p>
    {active && !needsVerification ? <JoinFamily /> : <>
      <p>{needsVerification ? "Xác minh email của bạn, rồi mở lại liên kết mời để tiếp tục." : "Đăng nhập hoặc tạo tài khoản riêng, rồi mở lại liên kết mời hoặc nhập mã để tiếp tục."}</p>
      <div className="settings-actions">
        <Link className="button button-primary" href={needsVerification ? "/verify-email" : "/login"}>{needsVerification ? "Xác minh email" : "Đăng nhập"}</Link>
        {!active && readAuthConfig().allowSignup && <Link className="button button-secondary" href="/register">Tạo tài khoản</Link>}
      </div>
    </>}
  </div></main>;
}
