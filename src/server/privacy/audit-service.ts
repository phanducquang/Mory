import "server-only";
import { z } from "zod";
import type { PrismaClient } from "../db/generated/client";
import type { AuthorizationService, SessionContext } from "../services/access";
import { ResourceNotFoundError } from "../db/errors";
export async function readFamilyAudit(db: PrismaClient, authorization: AuthorizationService, session: SessionContext, cursor?: string) {
  await authorization.requireFamilyAccess(session, "write");
  const boundary = cursor ? await db.auditLog.findFirst({ where: { familyId: session.familyId, id: z.uuid().parse(cursor) } }) : null;
  if (cursor && !boundary) throw new ResourceNotFoundError();
  const rows = await db.auditLog.findMany({ where: { familyId: session.familyId, ...(boundary ? { OR: [{ createdAt: { lt: boundary.createdAt } }, { createdAt: boundary.createdAt, id: { lt: boundary.id } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26 });
  return { entries: rows.slice(0, 25).map((row) => ({ id: row.id, resourceKind: row.resourceKind, action: row.action, createdAt: row.createdAt.toISOString(), actor: row.actorId === session.userId ? "Bạn" : row.actorId ? "Thành viên gia đình" : "Hệ thống" })),
    nextCursor: rows.length > 25 ? rows[24].id : undefined };
}
