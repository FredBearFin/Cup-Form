import { test } from "node:test";
import assert from "node:assert/strict";
import { dismissToast, makeToast, toastDurationMs } from "../src/lib/toast/state.ts";
import { friendlyErrorMessage } from "../src/lib/trpc/errors.ts";

test("showing a toast replaces the active one; dismiss clears it", () => {
  const first = makeToast("Success", "Saved");
  const second = makeToast("Error", "Boom");
  assert.notEqual(first.id, second.id);
  assert.equal(dismissToast(second, second.id), null);
});

test("a stale dismiss (timer for a replaced toast) leaves the newer toast alone", () => {
  const first = makeToast("Info", "one");
  const second = makeToast("Info", "two");
  assert.equal(dismissToast(second, first.id), second);
  assert.equal(dismissToast(null, first.id), null);
});

test("errors and warnings stay on screen longer", () => {
  assert.ok(toastDurationMs("Error") > toastDurationMs("Success"));
  assert.equal(toastDurationMs("Warning"), toastDurationMs("Error"));
});

test("zod issue lists become one readable sentence; plain messages pass through", () => {
  const raw = JSON.stringify([{ path: ["coffeeName"], message: "Too small" }, { path: [], message: "Bad" }]);
  assert.equal(friendlyErrorMessage(raw), "coffeeName: Too small; Bad");
  assert.equal(friendlyErrorMessage("Roast not found"), "Roast not found");
  assert.equal(friendlyErrorMessage("[not json"), "[not json");
});
