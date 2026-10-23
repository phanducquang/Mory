import Link from "next/link";
import { requireIdentity } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { getServerRuntime } from "@/server/runtime";
import { serverDataEnabled } from "@/server/auth/config";
import { initializeFamily } from "./actions";
export const dynamic = "force-dynamic";
export default async function WelcomePage() {
  if (!serverDataEnabled()) redirect("/home");
  const { db } = getServerRuntime();
  const identity = await requireIdentity();
  if (await db.familyMember.findFirst({ where: { userId: identity.user.id, family: { deletionRequestedAt: null } }, select: { userId: true } })) redirect("/home");
  return <main className="auth-page"><div className="auth-card"><h1>Chào mừng bạn đến với Mory</h1><p>Tạo một không gian gia đình riêng, rồi thêm hồ sơ đầu tiên của con.</p><form action={initializeFamily}><button className="button button-primary">Tạo không gian gia đình</button></form><Link href="/account">Quản lý tài khoản</Link></div></main>;
}
