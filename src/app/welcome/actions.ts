"use server";
import { setAuditActor } from "@/server/db/audit";
import { requireIdentity } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerRuntime } from "@/server/runtime";

export async function initializeFamily() {
  const { db } = getServerRuntime();
  const identity = await requireIdentity();
  const userId = z.uuid().parse(identity.user.id);
  await db.$transaction(async (tx) => {
    await setAuditActor(tx, userId);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    if (!await tx.familyMember.findFirst({ where: { userId, family: { deletionRequestedAt: null } }, select: { userId: true } }))
      await tx.family.create({ data: { name: "Gia đình của tôi", members: { create: { userId, role: "OWNER" } } } });
  });
  redirect("/home");
}
