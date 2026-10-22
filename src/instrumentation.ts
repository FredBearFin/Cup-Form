/// Fail fast on a broken environment: `register` runs once before the server
/// accepts requests, so a bad config stops startup instead of letting the app
/// serve requests that crash on the first Supabase/Stripe/DB call.
/// `next build` does not run this, so builds work without secrets (CI).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    console.warn("[env] SKIP_ENV_VALIDATION=1 — startup environment validation skipped");
    return;
  }
  const { assertEnvironmentOrExit } = await import("./instrumentation-node");
  assertEnvironmentOrExit();
}
