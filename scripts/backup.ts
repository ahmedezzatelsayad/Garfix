/**
 * backup.ts — Manual backup runner (calls lib/backup).
 * Usage: bun run scripts/backup.ts [label]
 */
import { runBackup } from "../src/lib/backup";

const label = process.argv[2] || "manual";

runBackup(label)
  .then((result) => {
    if (result.ok) {
      console.log(`✅ Backup completed: ${result.filePath}`);
      console.log(`   Size: ${(result.size! / 1024).toFixed(1)} KB`);
      console.log(`   Duration: ${result.durationMs}ms`);
      process.exit(0);
    } else {
      console.error(`❌ Backup failed: ${result.error}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("❌ Unhandled error:", err);
    process.exit(1);
  });
