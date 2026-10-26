import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAccount } from "@/server/auth/session";
import { serverDataEnabled } from "@/server/auth/config";
import { getServerRuntime } from "@/server/runtime";
import { createFamilySharingService } from "@/server/family/invitations";
import { FamilyMembers } from "@/features/family/family-members";
import { SessionBoundary } from "@/features/auth/session-boundary";
export const dynamic = "force-dynamic";
export default async function FamilyPage() {
  if (!serverDataEnabled()) redirect("/settings");
  const account = await requireAccount();
  const initial = await createFamilySharingService(getServerRuntime().db, account.userId).overview(account.familyId);
  return <main className="auth-page"><div className="auth-card family-card">
    <SessionBoundary />
    <Link className="account-back-link" href="/settings">← Cài đặt gia đình</Link>
    <h1>Thành viên gia đình</h1>
    <FamilyMembers initial={initial} />
  </div></main>;
}
