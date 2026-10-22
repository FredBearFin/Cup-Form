import { test } from "node:test";
import assert from "node:assert/strict";
import { createAlertRaiser, type MonitoringAlert } from "../src/lib/monitoring/alerts.ts";
import { cachedProbe, migrationsHealthy, runHealthCheck, type HealthProbes } from "../src/lib/health/checks.ts";
import type { HealthReport } from "../src/lib/config/env.ts";

const healthyBase: HealthReport = { db: "OK", supabaseAuth: "OK", stripe: "OK", prismaClient: "OK", appBuild: "OK" };
const ok = async () => true;
const allOk: HealthProbes = { db: ok, auth: ok, stripe: ok, prismaClient: ok, migrations: ok };

test("alerts are logged as JSON, pushed to the notifier and kept in order", async () => {
  const lines: string[] = [];
  const notified: MonitoringAlert[] = [];
  const raiser = createAlertRaiser({ log: (_l, line) => lines.push(line), notify: async (a) => void notified.push(a), now: () => new Date("2026-01-01T00:00:00Z") });
  await raiser.raise("Critical", "boom", { eventId: "evt_1" });
  await raiser.raise("Info", "fyi");
  assert.deepEqual(JSON.parse(lines[0]), { type: "monitoring_alert", level: "Critical", message: "boom", timestamp: "2026-01-01T00:00:00.000Z", eventId: "evt_1" });
  assert.deepEqual(raiser.recent().map((a) => a.level), ["Critical", "Info"]);
  assert.equal(notified.length, 2);
});

test("an identical alert inside the cooldown is dropped, then allowed again", async () => {
  let t = 0;
  const raiser = createAlertRaiser({ log: () => {}, cooldownMs: 1000, now: () => new Date(t) });
  assert.equal(await raiser.raise("Critical", "down"), true);
  t = 500;
  assert.equal(await raiser.raise("Critical", "down"), false);
  assert.equal(await raiser.raise("Warning", "down"), true);
  t = 1500;
  assert.equal(await raiser.raise("Critical", "down"), true);
});

test("a failing notifier never breaks the caller", async () => {
  const lines: string[] = [];
  const raiser = createAlertRaiser({ log: (_l, line) => lines.push(line), notify: async () => { throw new Error("slack down"); } });
  assert.equal(await raiser.raise("Critical", "x"), true);
  assert.match(lines[1], /monitoring_notify_failed/);
});

test("a healthy system reports OK everywhere and raises nothing", async () => {
  const raised: unknown[][] = [];
  const report = await runHealthCheck(healthyBase, allOk, (...a) => raised.push(a));
  assert.deepEqual(report, { ...healthyBase, migrationStatus: "OK" });
  assert.equal(raised.length, 0);
});

test("each subsystem failing is reported and raises a Critical alert naming it", async () => {
  for (const [probe, key] of [["auth", "supabaseAuth"], ["stripe", "stripe"], ["prismaClient", "prismaClient"], ["migrations", "migrationStatus"]] as const) {
    const raised: unknown[][] = [];
    const report = await runHealthCheck(healthyBase, { ...allOk, [probe]: async () => false }, (...a) => raised.push(a));
    assert.equal(report[key], "UNHEALTHY", key);
    assert.deepEqual(raised, [["Critical", "Health check failed", { failing: [key] }]]);
  }
});

test("a throwing probe counts as unhealthy, and a dead database takes its dependents with it", async () => {
  const raised: unknown[][] = [];
  const report = await runHealthCheck(healthyBase, { ...allOk, db: async () => { throw new Error("ECONNREFUSED"); } }, (...a) => raised.push(a));
  assert.deepEqual([report.db, report.prismaClient, report.migrationStatus], ["UNHEALTHY", "UNHEALTHY", "UNHEALTHY"]);
  assert.equal(raised.length, 1);
});

test("missing config is reported as such and its live probe is skipped", async () => {
  let called = false;
  const report = await runHealthCheck({ ...healthyBase, stripe: "MISSING" }, { ...allOk, stripe: async () => { called = true; return true; } }, () => {});
  assert.equal(report.stripe, "MISSING");
  assert.equal(called, false);
});

test("migration drift: unfinished or missing migrations are unhealthy", async () => {
  const done = (name: string) => ({ migration_name: name, finished_at: new Date(), rolled_back_at: null });
  assert.equal(await migrationsHealthy([done("a"), done("b")], ["a", "b"]), true);
  assert.equal(await migrationsHealthy([done("a")], ["a", "b"]), false); // b committed but not applied
  assert.equal(await migrationsHealthy([done("a"), { migration_name: "b", finished_at: null, rolled_back_at: null }], null), false); // failed midway
  assert.equal(await migrationsHealthy([done("a")], null), true); // folder not deployed: only failures are checked
});

test("cachedProbe reuses a result inside the ttl", async () => {
  let calls = 0;
  let t = 0;
  const probe = cachedProbe(async () => (++calls, true), 1000, () => t);
  await probe(); await probe();
  assert.equal(calls, 1);
  t = 1000;
  await probe();
  assert.equal(calls, 2);
});
