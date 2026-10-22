import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_LIMITS,
  cuppingCreateBlock,
  derivePlanLimits,
  mapStripeStatus,
  roastCreateBlock,
  ROAST_LIMIT_MESSAGE,
} from "../src/lib/billing/plans.ts";

const prices = { monthly: "price_m", annual: "price_a" };
const now = new Date("2026-06-01T00:00:00Z");
const day = 86_400_000;
const sub = (status: string, priceId: string | null = null, trialEndsAt: Date | null = null) => ({ status, priceId, trialEndsAt });

test("Stripe statuses map onto the five app statuses", () => {
  assert.deepEqual(
    ["trialing", "active", "past_due", "canceled", "incomplete", "unpaid", "incomplete_expired", "paused", "something_new"].map(mapStripeStatus),
    ["trialing", "active", "past_due", "canceled", "incomplete", "past_due", "canceled", "canceled", "incomplete"],
  );
});

test("no subscription, canceled and incomplete are Free", () => {
  assert.equal(derivePlanLimits(null, prices, now), FREE_LIMITS);
  assert.equal(derivePlanLimits(sub("canceled", "price_m"), prices, now), FREE_LIMITS);
  assert.equal(derivePlanLimits(sub("incomplete", "price_m"), prices, now), FREE_LIMITS);
});

test("active plans are unlimited, with the tier taken from the price", () => {
  const monthly = derivePlanLimits(sub("active", "price_m"), prices, now);
  const annual = derivePlanLimits(sub("active", "price_a"), prices, now);
  assert.deepEqual([monthly.tier, annual.tier], ["monthly", "annual"]);
  for (const l of [monthly, annual]) {
    assert.deepEqual([l.maxRoasts, l.maxCuppingSessionsPerRoast, l.exportEnabled, l.comparisonEnabled], [null, null, true, true]);
  }
});

test("past_due keeps paid access while the user fixes billing", () => {
  assert.equal(derivePlanLimits(sub("past_due", "price_a"), prices, now).tier, "annual");
});

test("a trial is paid-level only until its end date", () => {
  assert.equal(derivePlanLimits(sub("trialing", null, new Date(+now + day)), prices, now).exportEnabled, true);
  assert.equal(derivePlanLimits(sub("trialing", null, new Date(+now - day)), prices, now), FREE_LIMITS);
  assert.equal(derivePlanLimits(sub("trialing", null, null), prices, now), FREE_LIMITS);
});

test("roast creation is blocked at the limit, not below it, and never when unlimited", () => {
  assert.equal(roastCreateBlock(FREE_LIMITS, FREE_LIMITS.maxRoasts! - 1), null);
  assert.equal(roastCreateBlock(FREE_LIMITS, FREE_LIMITS.maxRoasts!), ROAST_LIMIT_MESSAGE);
  assert.equal(roastCreateBlock(derivePlanLimits(sub("active"), prices, now), 10_000), null);
});

test("cupping creation is blocked once a roast has the per-roast maximum", () => {
  const max = FREE_LIMITS.maxCuppingSessionsPerRoast!;
  assert.equal(cuppingCreateBlock(FREE_LIMITS, max - 1), null);
  assert.match(cuppingCreateBlock(FREE_LIMITS, max)!, /^Plan limit reached/);
  assert.equal(cuppingCreateBlock(derivePlanLimits(sub("active"), prices, now), 10_000), null);
});
