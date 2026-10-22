"use client";

import { PROCESSES, ROAST_LEVELS, ROAST_LEVEL_LABELS } from "@/lib/roast/enums";
import { isInvertedRange, type FilterState } from "@/lib/roast/filter-state";

const inputClass = "rounded-md border border-neutral-300 px-3 py-2 text-sm";

/// Origin / process / roast level / date-range controls (Op_ApplyFilter's
/// criteria other than the name search, which lives next to the list).
export function FilterPanel({
  value,
  origins,
  onChange,
}: {
  value: FilterState;
  origins: string[];
  onChange: (patch: Partial<FilterState>) => void;
}) {
  return (
    <div
      id="filter-panel"
      role="group"
      aria-label="Filters"
      className="grid grid-cols-1 gap-3 rounded-md border border-neutral-200 p-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1 text-sm">
        Origin
        <select className={inputClass} value={value.originFilter} onChange={(e) => onChange({ originFilter: e.target.value })}>
          <option value="">All origins</option>
          {origins.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Process
        <select className={inputClass} value={value.processFilter} onChange={(e) => onChange({ processFilter: e.target.value })}>
          <option value="">All processes</option>
          {PROCESSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Roast level
        <select className={inputClass} value={value.roastLevelFilter} onChange={(e) => onChange({ roastLevelFilter: e.target.value })}>
          <option value="">All levels</option>
          {ROAST_LEVELS.map((l) => (
            <option key={l} value={l}>
              {ROAST_LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Roasted from
          <input type="date" className={inputClass} value={value.dateFrom} max={value.dateTo || undefined} onChange={(e) => onChange({ dateFrom: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Roasted to
          <input type="date" className={inputClass} value={value.dateTo} min={value.dateFrom || undefined} onChange={(e) => onChange({ dateTo: e.target.value })} />
        </label>
      </div>
      {isInvertedRange(value) && (
        <p role="alert" className="text-sm text-amber-700 sm:col-span-2">
          The start date is after the end date, so nothing can match.
        </p>
      )}
    </div>
  );
}
