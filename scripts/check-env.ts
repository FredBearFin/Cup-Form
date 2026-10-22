import { formatEnvIssues, validateEnvironment } from "../src/lib/config/env.ts";

const result = validateEnvironment(process.env);
console.log("Health (from configuration):", JSON.stringify(result.health, null, 2));

if (result.health.appBuild !== "OK") {
  console.error(`\nEnvironment validation failed:\n${formatEnvIssues(result)}`);
  console.error("\nSee .env.example and docs/phase-0.md for expected values.");
  process.exit(1);
}
console.log("\nEnvironment validation passed");
