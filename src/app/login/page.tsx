import Link from "next/link";
import { AuthForm } from "@/features/auth/auth-form";
import { readAuthConfig, serverDataEnabled } from "@/server/auth/config";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  if (!serverDataEnabled()) return <main className="auth-page"><div className="auth-card"><h1>Đang ở bản trải nghiệm</h1><p>Chế độ tài khoản chưa được bật trên máy chủ này.</p><Link className="button button-primary" href="/home">Mở bản trải nghiệm</Link></div></main>;
  return <AuthForm emailEnabled={readAuthConfig().emailEnabled} allowSignup={readAuthConfig().allowSignup} />;
}
