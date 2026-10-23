import "server-only";
import { readAuthConfig } from "./config";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerRuntime } from "../runtime";
import { ResourceNotFoundError } from "../db/errors";

export async function requireIdentity() {
  const { auth, db } = getServerRuntime();
  const identity = await auth.api.getSession({ headers: await headers() });
  if (!identity) redirect("/login");
  if (!await db.user.findFirst({ where: { id: identity.user.id, deletionRequestedAt: null }, select: { id: true } })) redirect("/account-deleted");
  if (readAuthConfig().emailEnabled && !identity.user.emailVerified) redirect("/verify-email");
  return identity;
}

export async function requireAccount() {
  const { db } = getServerRuntime();
  const identity = await requireIdentity();
  const memberships = await db.familyMember.findMany({ where: { userId: identity.user.id, family: { deletionRequestedAt: null } }, orderBy: { familyId: "asc" } });
  if (!memberships.length) redirect("/welcome");
  const requested = (await cookies()).get("mory-family")?.value;
  const member = requested ? memberships.find((m) => m.familyId === requested) : memberships[0];
  if (!member) throw new ResourceNotFoundError();
  return { userId: identity.user.id, familyId: member.familyId, displayName: identity.user.name, role: member.role };
}
