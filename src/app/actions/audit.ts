"use server";
import { accountServices } from "@/server/services/account-journey";
import { readFamilyAudit } from "@/server/privacy/audit-service";
export async function readAudit(cursor?: string) {
  const { db, authorization, account } = await accountServices();
  return readFamilyAudit(db, authorization, account, cursor);
}
