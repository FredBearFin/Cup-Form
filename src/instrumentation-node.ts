import { formatEnvIssues, validateEnvironment } from "@/lib/config/env";

/// Exits instead of throwing: a thrown error leaves `next start` listening
/// with a half-initialised server, which is exactly the silent startup
/// failure Phase 0 rules out.
export function assertEnvironmentOrExit() {
  const result = validateEnvironment(process.env);
  if (result.health.appBuild === "OK") return;

  console.error(
    `[env] Environment validation failed:\n${formatEnvIssues(result)}\n` +
      "See .env.example and docs/phase-0.md. Set SKIP_ENV_VALIDATION=1 to bypass (not for production).",
  );
  process.exit(1);
}
