import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRoute } from "../src/lib/supabase/route-access.ts";

test("/app and everything under it is protected", () => {
  for (const path of ["/app", "/app/", "/app/history", "/app/roasts/new", "/app/roasts/abc"]) {
    assert.equal(classifyRoute(path), "protected", path);
  }
});

test("/login is the signed-out route", () => {
  assert.equal(classifyRoute("/login"), "auth");
});

test("look-alike prefixes are not treated as protected or auth routes", () => {
  for (const path of ["/application", "/apple", "/login-help", "/loginx"]) {
    assert.equal(classifyRoute(path), "public", path);
  }
});

test("callback, webhook, health and landing page stay public", () => {
  for (const path of ["/", "/auth/callback", "/api/stripe/webhook", "/api/health", "/api/trpc/roast.list"]) {
    assert.equal(classifyRoute(path), "public", path);
  }
});
