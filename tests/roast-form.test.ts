import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyRoastForm, roastToFormValues, toRoastPayload } from "../src/lib/roast/form.ts";

test("blank optional fields are omitted on create", () => {
  const payload = toRoastPayload({ ...emptyRoastForm(), coffeeName: "  Yirgacheffe " }, undefined);
  assert.equal(payload.coffeeName, "Yirgacheffe");
  assert.equal(payload.origin, undefined);
  assert.equal(payload.process, undefined);
  assert.equal(payload.batchSizeG, undefined);
});

test("blank optional fields are null on update so they get cleared", () => {
  const payload = toRoastPayload({ ...emptyRoastForm(), coffeeName: "X" }, null);
  assert.equal(payload.origin, null);
  assert.equal(payload.roastLevel, null);
  assert.equal(payload.roastTimeS, null);
  assert.equal(payload.notes, null);
});

test("filled fields map through, numbers become numbers, non-enum values become blank", () => {
  const payload = toRoastPayload(
    { ...emptyRoastForm(), coffeeName: "X", process: "Washed", roastLevel: "MediumDark", batchSizeG: "250", roastDate: "2026-03-04" },
    undefined,
  );
  assert.equal(payload.process, "Washed");
  assert.equal(payload.roastLevel, "MediumDark");
  assert.equal(payload.batchSizeG, 250);
  assert.equal(payload.roastDate.toISOString(), "2026-03-04T00:00:00.000Z");
  assert.equal(toRoastPayload({ ...emptyRoastForm(), coffeeName: "X", process: "City+" }, undefined).process, undefined);
});

test("stored roasts round-trip into form values, using the stored calendar day", () => {
  const values = roastToFormValues({
    coffeeName: "X",
    origin: null,
    variety: "Gesha",
    process: "Natural",
    roastDate: new Date("2026-03-04T00:00:00.000Z"),
    batchSizeG: 300,
    roastLevel: null,
    roastTimeS: null,
    notes: null,
  });
  assert.equal(values.roastDate, "2026-03-04");
  assert.equal(values.origin, "");
  assert.equal(values.batchSizeG, "300");
  assert.equal(values.variety, "Gesha");
});
