import { test } from "node:test";
import assert from "node:assert/strict";
import { assertValidEnvironment, validateEnvironment } from "../src/lib/config/env.ts";

const jwt = "aaa.bbb.ccc";
const valid = {
  DATABASE_URL: "postgresql://postgres:pw@db.example.supabase.co:5432/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt,
  SUPABASE_SERVICE_ROLE_KEY: jwt,
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  STRIPE_PRICE_ID_MONTHLY: "price_monthly",
  STRIPE_PRICE_ID_ANNUAL: "price_annual",
};

test("a complete, well-formed environment is healthy", () => {
  const result = validateEnvironment(valid);
  assert.deepEqual(result.health, {
    db: "OK",
    supabaseAuth: "OK",
    stripe: "OK",
    prismaClient: "OK",
    appBuild: "OK",
  });
  assert.doesNotThrow(() => assertValidEnvironment(valid));
});

test("missing vars are reported and make the app UNHEALTHY", () => {
  const env: Record<string, string | undefined> = { ...valid };
  delete env.DATABASE_URL;
  delete env.STRIPE_WEBHOOK_SECRET;
  const result = validateEnvironment(env);
  assert.deepEqual(result.missingVars.sort(), ["DATABASE_URL", "STRIPE_WEBHOOK_SECRET"]);
  assert.equal(result.health.db, "MISSING");
  assert.equal(result.health.prismaClient, "MISSING");
  assert.equal(result.health.stripe, "MISSING");
  assert.equal(result.health.supabaseAuth, "OK");
  assert.equal(result.health.appBuild, "UNHEALTHY");
  assert.throws(() => assertValidEnvironment(env), /DATABASE_URL: missing/);
});

test("blank values count as missing", () => {
  const result = validateEnvironment({ ...valid, STRIPE_SECRET_KEY: "  " });
  assert.deepEqual(result.missingVars, ["STRIPE_SECRET_KEY"]);
});

test("malformed values are INVALID, not OK", () => {
  const result = validateEnvironment({
    ...valid,
    DATABASE_URL: "mysql://nope",
    STRIPE_SECRET_KEY: "pk_test_wrong",
    STRIPE_PRICE_ID_ANNUAL: "prod_123",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "not-a-key",
  });
  assert.deepEqual(result.invalidVars.map((v) => v.name).sort(), [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "STRIPE_PRICE_ID_ANNUAL",
    "STRIPE_SECRET_KEY",
  ]);
  assert.equal(result.health.db, "INVALID");
  assert.equal(result.health.stripe, "INVALID");
  assert.equal(result.health.appBuild, "UNHEALTHY");
});

test("values copied from .env.example are rejected as placeholders", () => {
  const result = validateEnvironment({
    ...valid,
    STRIPE_SECRET_KEY: "sk_test_...",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
  });
  assert.deepEqual(result.invalidVars.map((v) => v.name).sort(), [
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "STRIPE_SECRET_KEY",
  ]);
});

test("accepts new-style Supabase keys and live Stripe keys", () => {
  const result = validateEnvironment({
    ...valid,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abc",
    STRIPE_SECRET_KEY: "rk_live_abc",
  });
  assert.equal(result.health.appBuild, "OK");
});

test("NEXT_PUBLIC_SITE_URL is optional but must be a URL when set", () => {
  assert.equal(validateEnvironment(valid).health.appBuild, "OK");
  const bad = validateEnvironment({ ...valid, NEXT_PUBLIC_SITE_URL: "localhost:3000" });
  assert.deepEqual(bad.invalidVars.map((v) => v.name), ["NEXT_PUBLIC_SITE_URL"]);
  assert.equal(bad.health.appBuild, "UNHEALTHY");
});
