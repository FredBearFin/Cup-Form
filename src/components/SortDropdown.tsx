"use client";

import { SORT_KEYS, SORT_LABELS, type SortKey } from "@/lib/roast/query";

export function SortDropdown({
  value,
  onChange,
  disabled,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-600">Sort</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {SORT_LABELS[key]}
          </option>
        ))}
      </select>
    </label>
  );
}
