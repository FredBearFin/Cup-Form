"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import { QueryError } from "@/components/QueryError";
import { FilterPanel } from "@/components/FilterPanel";
import { SortDropdown } from "@/components/SortDropdown";
import { ExportButton } from "@/components/ExportButton";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { DEFAULT_SORT_KEY, activeFilterCount, type SortKey } from "@/lib/roast/query";
import { emptyFilters, toListInput, type FilterState } from "@/lib/roast/filter-state";
import { roastScore } from "@/lib/roast/sort";
import { canCompare } from "@/lib/roast/compare";
import { roastLevelLabel } from "@/lib/roast/enums";
import { COMPARISON_PLAN_MESSAGE } from "@/lib/billing/plans";

export default function RoastsPage() {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Typing in the search box shouldn't fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(filters.searchText, 300);
  const listInput = toListInput({ ...filters, searchText: debouncedSearch }, sortKey);

  const { data: roasts, isLoading, error, refetch } = trpc.roast.list.useQuery(listInput, {
    placeholderData: keepPreviousData,
  });
  const { data: origins = [] } = trpc.roast.origins.useQuery();
  // Unknown while loading: gated actions stay usable and the server decides.
  const { data: plan } = trpc.subscription.plan.useQuery();
  const exportLocked = plan ? !plan.limits.exportEnabled : false;
  const compareLocked = plan ? !plan.limits.comparisonEnabled : false;

  const results = roasts ?? [];
  const filterCount = activeFilterCount(filters);
  // Only roasts still on screen count as selected, so Export/Compare can't
  // act on something the user filtered out of view.
  const selectedRoasts = results.filter((r) => selected.has(r.id));
  const allSelected = results.length > 0 && selectedRoasts.length === results.length;
  const compareReady = selectedRoasts.length === 2 && canCompare(selectedRoasts[0], selectedRoasts[1]);

  const patchFilters = (patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /// Op_ClearFilters: criteria empty, default sort, full list.
  function clearFilters() {
    setFilters(emptyFilters());
    setSortKey(DEFAULT_SORT_KEY);
    setSelected(new Set());
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your roasts</h1>
        <Link href="/app/roasts/new" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
          Log a roast
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.searchText}
          onChange={(e) => patchFilters({ searchText: e.target.value })}
          placeholder="Search coffee name"
          aria-label="Search coffee name"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="filter-panel"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>
      </div>

      {filtersOpen && <FilterPanel value={filters} origins={origins} onChange={patchFilters} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SortDropdown value={sortKey} onChange={setSortKey} disabled={results.length === 0} />
        {(filterCount > 0 || sortKey !== DEFAULT_SORT_KEY) && (
          <button onClick={clearFilters} className="text-sm text-neutral-600 underline">
            Clear filters
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(results.map((r) => r.id)))} />
            {selectedRoasts.length > 0 ? `${selectedRoasts.length} selected` : "Select all"}
          </label>
          <div className="flex items-center gap-2">
            {compareReady && !compareLocked ? (
              <Link
                href={`/app/compare?a=${selectedRoasts[0].id}&b=${selectedRoasts[1].id}`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              >
                Compare
              </Link>
            ) : (
              <button
                disabled
                title={
                  compareLocked
                    ? COMPARISON_PLAN_MESSAGE
                    : selectedRoasts.length === 2
                    ? "These roasts share no origin, process, or roast level"
                    : "Select two roasts that share an origin, process, or roast level"
                }
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm opacity-50"
              >
                Compare
              </button>
            )}
            <ExportButton roastIds={selectedRoasts.map((r) => r.id)} locked={exportLocked} />
          </div>
        </div>
      )}
      {selectedRoasts.length === 2 && !compareReady && !compareLocked && (
        <p className="text-sm text-neutral-500">Compare needs two roasts that share an origin, process, or roast level.</p>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading...</p>}
      {error && <QueryError error={error} onRetry={() => refetch()} />}

      {roasts?.length === 0 &&
        (filterCount > 0 ? (
          <p className="text-sm text-neutral-500">
            No roasts match your filters.{" "}
            <button onClick={clearFilters} className="underline">
              Clear filters
            </button>
          </p>
        ) : (
          <p className="text-sm text-neutral-500">No roasts yet. Log your first one to start cupping it.</p>
        ))}

      <ul className="flex flex-col gap-2">
        {results.map((roast) => {
          const score = roastScore(roast);
          const details = [
            new Date(roast.roastDate).toLocaleDateString(undefined, { timeZone: "UTC" }),
            roast.origin,
            roast.process,
            roast.roastLevel && roastLevelLabel(roast.roastLevel),
          ].filter(Boolean);
          return (
            <li key={roast.id} className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-3 hover:border-neutral-400">
              <input type="checkbox" aria-label={`Select ${roast.coffeeName}`} checked={selected.has(roast.id)} onChange={() => toggle(roast.id)} />
              <Link href={`/app/roasts/${roast.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{roast.coffeeName}</p>
                  <p className="truncate text-sm text-neutral-500">{details.join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right text-sm text-neutral-400">
                  {score !== null && <p className="font-medium text-neutral-700">{score.toFixed(2)}</p>}
                  <p>
                    {roast.cuppingSessions.length} cupping{roast.cuppingSessions.length === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
