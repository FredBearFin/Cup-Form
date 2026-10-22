import { PROCESSES, ROAST_LEVELS, type Process, type RoastLevel } from "./enums";

/// Roast form state: everything is a string because it comes from inputs.
export type RoastFormValues = {
  coffeeName: string;
  origin: string;
  variety: string;
  process: string;
  roastDate: string;
  batchSizeG: string;
  roastLevel: string;
  roastTimeS: string;
  notes: string;
};

export const emptyRoastForm = (): RoastFormValues => ({
  coffeeName: "",
  origin: "",
  variety: "",
  process: "",
  roastDate: new Date().toISOString().slice(0, 10),
  batchSizeG: "",
  roastLevel: "",
  roastTimeS: "",
  notes: "",
});

type Blank = undefined | null;

/// Maps form strings to API input. A blank optional field is `undefined`
/// when creating (omit it) and `null` when updating (clear it).
export function toRoastPayload<B extends Blank>(values: RoastFormValues, blank: B) {
  const str = (v: string) => (v.trim() === "" ? blank : v.trim());
  const num = (v: string) => (v.trim() === "" ? blank : Number(v));
  return {
    coffeeName: values.coffeeName.trim(),
    roastDate: new Date(values.roastDate),
    origin: str(values.origin),
    variety: str(values.variety),
    process: (PROCESSES as readonly string[]).includes(values.process)
      ? (values.process as Process)
      : blank,
    batchSizeG: num(values.batchSizeG),
    roastLevel: (ROAST_LEVELS as readonly string[]).includes(values.roastLevel)
      ? (values.roastLevel as RoastLevel)
      : blank,
    roastTimeS: num(values.roastTimeS),
    notes: str(values.notes),
  };
}

type StoredRoast = {
  coffeeName: string;
  origin: string | null;
  variety: string | null;
  process: string | null;
  roastDate: Date | string;
  batchSizeG: number | null;
  roastLevel: string | null;
  roastTimeS: number | null;
  notes: string | null;
};

export function roastToFormValues(roast: StoredRoast): RoastFormValues {
  return {
    coffeeName: roast.coffeeName,
    origin: roast.origin ?? "",
    variety: roast.variety ?? "",
    process: roast.process ?? "",
    // roast_date is a DATE column, so the UTC calendar day is the stored day.
    roastDate: new Date(roast.roastDate).toISOString().slice(0, 10),
    batchSizeG: roast.batchSizeG?.toString() ?? "",
    roastLevel: roast.roastLevel ?? "",
    roastTimeS: roast.roastTimeS?.toString() ?? "",
    notes: roast.notes ?? "",
  };
}
