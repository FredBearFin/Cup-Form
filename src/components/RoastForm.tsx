"use client";

import { useState } from "react";
import { PROCESSES, ROAST_LEVELS, ROAST_LEVEL_LABELS } from "@/lib/roast/enums";
import type { RoastFormValues } from "@/lib/roast/form";

const inputClass = "rounded-md border border-neutral-300 px-3 py-2";

export function RoastForm({
  initialValues,
  submitLabel,
  isPending,
  errorMessage,
  onSubmit,
}: {
  initialValues: RoastFormValues;
  submitLabel: string;
  isPending: boolean;
  errorMessage?: string;
  onSubmit: (values: RoastFormValues) => void;
}) {
  const [form, setForm] = useState(initialValues);

  function field(key: keyof RoastFormValues) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  // A legacy free-text value (from before these were enums) stays selectable
  // so editing an old roast doesn't silently drop it.
  const legacyProcess = form.process && !(PROCESSES as readonly string[]).includes(form.process);
  const legacyLevel = form.roastLevel && !(ROAST_LEVELS as readonly string[]).includes(form.roastLevel);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Coffee name
        <input required maxLength={200} className={inputClass} {...field("coffeeName")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Origin
        <input maxLength={200} className={inputClass} {...field("origin")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Variety
        <input maxLength={200} className={inputClass} {...field("variety")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Process
        <select className={inputClass} {...field("process")}>
          <option value="">—</option>
          {legacyProcess && <option value={form.process}>{form.process} (legacy)</option>}
          {PROCESSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Roast date
        <input type="date" required className={inputClass} {...field("roastDate")} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Batch size (g)
          <input type="number" min={1} step={1} className={inputClass} {...field("batchSizeG")} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Roast time (s)
          <input type="number" min={1} step={1} className={inputClass} {...field("roastTimeS")} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Roast level
        <select className={inputClass} {...field("roastLevel")}>
          <option value="">—</option>
          {legacyLevel && <option value={form.roastLevel}>{form.roastLevel} (legacy)</option>}
          {ROAST_LEVELS.map((l) => (
            <option key={l} value={l}>
              {ROAST_LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea rows={3} maxLength={5000} className={inputClass} {...field("notes")} />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : submitLabel}
      </button>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
    </form>
  );
}
