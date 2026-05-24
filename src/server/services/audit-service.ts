import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";
import { logger } from "../lib/logger.js";

export async function writeAudit(
  action: string,
  hedef: string,
  ozet: string,
  actorId?: string
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action,
      hedef,
      ozet,
      actorId: actorId ?? null,
    });
  } catch (e) {
    logger.error({ err: e }, "writeAudit failed");
  }
}
