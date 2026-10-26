import Link from "next/link";
import { requireIdentity } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { getServerRuntime } from "@/server/runtime";
import { serverDataEnabled } from "@/server/auth/config";
import { initializeFamily } from "./actions";
import styles from "./welcome.module.css";
export const dynamic = "force-dynamic";
export default async function WelcomePage() {
  if (!serverDataEnabled()) redirect("/home");
  const { db } = getServerRuntime();
  const identity = await requireIdentity();
  if (await db.familyMember.findFirst({ where: { userId: identity.user.id, family: { deletionRequestedAt: null } }, select: { userId: true } })) redirect("/home");
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Chào mừng bạn đến với Mory</h1>
        <p>Tạo một không gian gia đình riêng, rồi thêm hồ sơ đầu tiên của con.</p>
        <form className={styles.createForm} action={initializeFamily}>
          <button type="submit" className={`button button-primary ${styles.createButton}`}>Tạo không gian gia đình</button>
        </form>
        <p>Đã có người thân dùng Mory? <Link className={styles.accountLink} href="/join">Tham gia bằng lời mời</Link></p>
        <div className={styles.accountFooter}>
          <Link className={styles.accountLink} href="/account">Quản lý tài khoản</Link>
        </div>
      </div>
    </main>
  );
}
