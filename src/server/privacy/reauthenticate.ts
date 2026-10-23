import "server-only";
import type { PrismaClient } from "../db/generated/client";
/** Shared per-user budget, independent of attacker-supplied IP forwarding headers. */
export async function consumeReauthenticationBudget(db: PrismaClient, userId: string) {
  const key = `reauth:${userId}`;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "AuthRateLimit" ("id","key","count","lastRequest") VALUES (gen_random_uuid(),${key},1,(extract(epoch FROM clock_timestamp())*1000)::bigint)
    ON CONFLICT ("key") DO UPDATE SET
    "count"=CASE WHEN "AuthRateLimit"."lastRequest" < (extract(epoch FROM clock_timestamp())*1000)::bigint-60000 THEN 1 ELSE LEAST(6,"AuthRateLimit"."count"+1) END,
    "lastRequest"=CASE WHEN "AuthRateLimit"."lastRequest" < (extract(epoch FROM clock_timestamp())*1000)::bigint-60000 THEN (extract(epoch FROM clock_timestamp())*1000)::bigint ELSE "AuthRateLimit"."lastRequest" END RETURNING "count"`;
  if (rows[0].count > 5) throw new Error("Vui lòng đợi một phút trước khi xác thực lại.");
}
