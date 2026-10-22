import { PROCESSES, ROAST_LEVELS } from "./enums";
import type { RoastQueryInput, SortKey } from "./query";

/// Filter form state. Everything is a string; "" is the spec's EMPTY.
export type FilterState = {
  originFilter: string;
  processFilter: string;
  roastLevelFilter: string;
  searchText: string;
  dateFrom: string;
  dateTo: string;
};

export const emptyFilters = (): FilterState => ({
  originFilter: "",
  processFilter: "",
  roastLevelFilter: "",
  searchText: "",
  dateFrom: "",
  dateTo: "",
});

/// FilterState + sort → typed `roast.list` input.
export function toListInput(filters: FilterState, sortKey: SortKey): RoastQueryInput {
  const oneOf = <T extends string>(allowed: readonly T[], v: string) =>
    (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  return {
    originFilter: filters.originFilter,
    processFilter: oneOf(PROCESSES, filters.processFilter),
    roastLevelFilter: oneOf(ROAST_LEVELS, filters.roastLevelFilter),
    searchText: filters.searchText,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sortKey,
  };
}

/// A range whose start is after its end can never match anything.
export const isInvertedRange = (f: Pick<FilterState, "dateFrom" | "dateTo">) =>
  Boolean(f.dateFrom && f.dateTo && f.dateFrom > f.dateTo);
