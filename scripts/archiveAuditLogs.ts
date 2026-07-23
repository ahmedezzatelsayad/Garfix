/**
 * archiveAuditLogs.ts — Move old audit logs to a separate archive file (E-13).
 *
 * Keeps the live `audit_logs` table small for fast queries; archive records
 * older than N days are exported to a JSONL file in /storage/audit-archive/
 * and then deleted from the DB.
 *
 * Run as a scheduled job (cron) or manually via:
 *   bun run scripts/archiveAuditLogs.ts
 *
 * Default retention: 90 days in DB, archive indefinitely.
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

const db = new PrismaClient();
const ARCHIVE_DIR = process.env.AUDIT_ARCHIVE_DIR || "/home/z/my-project/storage/audit-archive";
const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || "90", 10);

async function main() {
  console.log(`📦 Archiving audit logs older than ${RETENTION_DAYS} days…`);

  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveFile = path.join(ARCHIVE_DIR, `audit-${ts}.jsonl`);

  // Fetch records to archive
  const records = await db.auditLog.findMany({
    where: { createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: 5000, // batch size
  });

  if (records.length === 0) {
    console.log("  ℹ️  No records to archive");
    return;
  }

  console.log(`  📝 Writing ${records.length} records to ${archiveFile}`);
  const lines = records.map((r) => JSON.stringify({
    id: r.id,
    userEmail: r.userEmail,
    userUid: r.userUid,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    companySlug: r.companySlug,
    details: r.details,
    createdAt: r.createdAt.toISOString(),
  }));
  await fs.writeFile(archiveFile, lines.join("\n") + "\n", "utf8");

  // Verify the file was written successfully before deleting
  const stat = await fs.stat(archiveFile);
  if (stat.size === 0) {
    throw new Error("Archive file is empty — refusing to delete DB records");
  }
  console.log(`  ✓ Archive file written (${stat.size} bytes)`);

  // Delete archived records from DB
  const ids = records.map((r) => r.id);
  // Delete in batches of 100 to avoid long transactions
  for (let i = 0; i < ids.length; i += 100) {
    await db.auditLog.deleteMany({ where: { id: { in: ids.slice(i, i + 100) } } });
  }
  console.log(`  ✓ Deleted ${records.length} archived records from DB`);

  console.log(`\n✅ Archive complete: ${archiveFile}`);
}

main()
  .catch((err) => { console.error("❌ Archive failed:", err); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
