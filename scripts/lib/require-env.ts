import { formatEnvIssues, validateEnvironment } from "../../src/lib/config/env.ts";

/// Live checks need a well-formed environment first; print the issue list
/// and exit instead of surfacing a stack trace.
export function requireValidEnv() {
  const result = validateEnvironment(process.env);
  if (result.health.appBuild !== "OK") {
    console.error(`Environment validation failed:\n${formatEnvIssues(result)}\nRun \`npm run check:env\`.`);
    process.exit(1);
  }
}
