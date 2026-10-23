import Link from "next/link";
import { readAuthConfig, serverDataEnabled } from "@/server/auth/config";
import { EmailRequestForm, EmailLinkForm } from "./email-forms";
export function EmailPage({ kind }: { kind: "verify" | "forgot" | "reset" }) {
  const enabled = serverDataEnabled() && readAuthConfig().emailEnabled;
  return <main className="auth-page"><div className="auth-card">
    <Link href="/" className="brand">mory.</Link>
    <h1>{kind === "verify" ? "Xác minh email" : kind === "forgot" ? "Quên mật khẩu" : "Đặt lại mật khẩu"}</h1>
    {!enabled ? <><p>Email tài khoản chưa được bật trên máy chủ này.</p><Link href="/login">Trở về đăng nhập</Link></>
      : kind === "forgot" ? <EmailRequestForm purpose="RESET" /> : <EmailLinkForm purpose={kind === "verify" ? "VERIFY" : "RESET"} />}
  </div></main>;
}
