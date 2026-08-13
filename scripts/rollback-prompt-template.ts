/**
 * rollback-prompt-template.ts — AI-12 FIX (Audit v2 · Phase 3)
 *
 * CLI alternative to the POST /api/founder-panel/prompt-templates/[id]/rollback
 * endpoint. Use this when you need to roll back a prompt template from a
 * shell (e.g. ops runbook, incident response, CI/CD migration step) without
 * going through the HTTP API.
 *
 * The script performs the SAME append-only rollback as the endpoint:
 *   1. Look up the current active row by id.
 *   2. Look up the target version's content by (name, targetVersion).
 *   3. Create a NEW row at version = current.version + 1 with the target's
 *      content, mark it active=true.
 *   4. Deactivate the previous active row (active=false).
 *   5. Invalidate the in-process prompt cache.
 *
 * Usage:
 *   DATABASE_URL=postgres://... \
 *   bunx tsx scripts/rollback-prompt-template.ts <promptTemplateId> <targetVersion> [changeLog]
 *
 * Example:
 *   bunx tsx scripts/rollback-prompt-template.ts seed-invoice-extract-v1 1 "revert broken JSON-only contract"
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main(): Promise<void> {
  const [idStr, targetVersionStr, ...rest] = process.argv.slice(2);
  if (!idStr || !targetVersionStr) {
    console.error("Usage: bunx tsx scripts/rollback-prompt-template.ts <id> <targetVersion> [changeLog]");
    process.exit(2);
  }
  const targetVersion = parseInt(targetVersionStr, 10);
  if (!Number.isInteger(targetVersion) || targetVersion < 1) {
    console.error(`Invalid targetVersion: ${targetVersionStr} (must be a positive integer)`);
    process.exit(2);
  }
  const changeLog = rest.join(" ").trim() || `CLI rollback to v${targetVersion}`;

  console.log(`[rollback-prompt-template] looking up id=${idStr}`);
  const current = await db.promptTemplate.findUnique({ where: { id: idStr } });
  if (!current) {
    console.error(`[rollback-prompt-template] ✗ prompt template not found: ${idStr}`);
    process.exit(1);
  }
  if (!current.active) {
    console.error(`[rollback-prompt-template] ✗ row ${idStr} is not active (active=false). Find the active row first.`);
    process.exit(1);
  }
  if (targetVersion >= current.version) {
    console.error(`[rollback-prompt-template] ✗ targetVersion (${targetVersion}) must be < current (${current.version})`);
    process.exit(1);
  }

  const target = await db.promptTemplate.findFirst({
    where: { name: current.name, version: targetVersion },
  });
  if (!target) {
    console.error(`[rollback-prompt-template] ✗ target version ${targetVersion} not found for name="${current.name}"`);
    process.exit(1);
  }

  const newVersion = current.version + 1;
  console.log(`[rollback-prompt-template] rolling back name="${current.name}" from v${current.version} to content of v${targetVersion} (will be persisted as v${newVersion})`);

  const [newRow] = await db.$transaction([
    db.promptTemplate.create({
      data: {
        name: current.name,
        version: newVersion,
        content: target.content,
        changeLog,
        active: true,
        createdBy: "cli@rollback-script",
      },
    }),
    db.promptTemplate.update({
      where: { id: current.id },
      data: { active: false },
    }),
  ]);

  console.log(`[rollback-prompt-template] ✓ done`);
  console.log(`  new active row:  id=${newRow.id} version=v${newRow.version}`);
  console.log(`  deactivated row: id=${current.id} version=v${current.version}`);
  console.log(`  changeLog: ${changeLog}`);
  console.log(`  NOTE: restart the app process so the in-process prompt cache is invalidated.`);
}

main()
  .catch((err) => {
    console.error("[rollback-prompt-template] fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
