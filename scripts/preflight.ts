// Runs every Phase 0 check in order; stops at the first failing stage because
// later stages depend on the earlier ones (no env → nothing else can work).
import { spawnSync } from "node:child_process";

const stages = ["check-env", "check-db", "check-auth", "check-stripe"];

for (const stage of stages) {
  console.log(`\n=== ${stage} ===`);
  const { status } = spawnSync(process.execPath, [`scripts/${stage}.ts`], {
    stdio: "inherit",
  });
  if (status !== 0) {
    console.error(`\nPreflight stopped: ${stage} failed`);
    process.exit(1);
  }
}
console.log("\nPreflight passed: all core services validated");
