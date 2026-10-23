import "server-only";
import { z } from "zod";
import { Prisma, type PrismaClient, type Event as EventRow } from "../db/generated/client";
import { timelineQuerySchema, normalizeSearch } from "@/lib/validation/timeline-query";
import { todayVN } from "@/lib/dates";
import { mapEvent } from "../db/mappers";
import { ResourceNotFoundError } from "../db/errors";

/** Bounded, tenant-scoped search. PostgreSQL normalization matches the browser's Vietnamese search. */
export async function queryFamilyEvents(db: PrismaClient, familyId: string, childId: string, rawQuery: unknown, cursor?: string) {
  const query = timelineQuerySchema.parse(rawQuery);
  const boundary = cursor ? await db.event.findFirst({ where: { familyId, childId, id: z.uuid().parse(cursor) } }) : null;
  if (cursor && !boundary) throw new ResourceNotFoundError();
  const after = boundary ? query.order === "asc"
    ? Prisma.sql`AND ("date", "time", "id") > (${boundary.date}::date, ${boundary.time}, ${boundary.id}::uuid)`
    : Prisma.sql`AND ("date", "time", "id") < (${boundary.date}::date, ${boundary.time}, ${boundary.id}::uuid)` : Prisma.empty;
  const order = query.order === "asc" ? Prisma.sql`"date" ASC, "time" ASC, "id" ASC` : Prisma.sql`"date" DESC, "time" DESC, "id" DESC`;
  const term = `%${normalizeSearch(query.search).replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.$queryRaw<EventRow[]>(Prisma.sql`
    SELECT * FROM "Event" WHERE "familyId" = ${familyId}::uuid AND "childId" = ${childId}::uuid
      AND (${query.type} = 'all' OR "type"::text = ${query.type})
      AND (${query.period} <> 'past' OR "date" <= ${todayVN()}::date)
      AND (${query.period} <> 'upcoming' OR "date" >= ${todayVN()}::date)
      AND replace(regexp_replace(normalize(lower("title" || ' ' || "description"), NFD), '[̀-ͯ]', '', 'g'), 'đ', 'd') LIKE ${term}
      ${after} ORDER BY ${order} LIMIT 26`);
  const page = rows.slice(0, 25);
  const assets = page.length ? await db.mediaAsset.findMany({ where: { familyId, childId, eventId: { in: page.map((e) => e.id) }, status: "READY", purpose: "EVENT" }, select: { id: true, eventId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : [];
  return { events: page.map((row) => mapEvent({ ...row, media: assets.filter((a) => a.eventId === row.id) })), nextCursor: rows.length > 25 ? page.at(-1)!.id : undefined };
}
