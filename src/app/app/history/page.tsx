"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { deriveTotalScore } from "@/lib/scoring/derive";
import { ScoreTrendChart } from "@/components/ScoreTrendChart";

export default function HistoryPage() {
  const { data: roasts, isLoading } = trpc.roast.list.useQuery();
  const [coffeeFilter, setCoffeeFilter] = useState<string>("all");

  const coffeeNames = useMemo(
    () => Array.from(new Set((roasts ?? []).map((r) => r.coffeeName))).sort(),
    [roasts],
  );

  const sessions = useMemo(() => {
    const rows = (roasts ?? [])
      .filter((r) => coffeeFilter === "all" || r.coffeeName === coffeeFilter)
      .flatMap((roast) =>
        roast.cuppingSessions.map((session) => ({
          roastId: roast.id,
          coffeeName: roast.coffeeName,
          cuppedAt: session.cuppedAt,
          score: deriveTotalScore(session),
        })),
      )
      .sort((a, b) => new Date(a.cuppedAt).getTime() - new Date(b.cuppedAt).getTime());
    return rows;
  }, [roasts, coffeeFilter]);

  const chartData = sessions.map((s) => ({
    date: new Date(s.cuppedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    label: `${s.coffeeName} · ${new Date(s.cuppedAt).toLocaleDateString()}`,
    score: s.score,
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">History</h1>
        <select
          value={coffeeFilter}
          onChange={(e) => setCoffeeFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="all">All coffees</option>
          {coffeeNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-neutral-500">Loading...</p>}

      <div className="rounded-md border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-600">Score over time</h2>
        <ScoreTrendChart data={chartData} />
      </div>

      <ul className="flex flex-col gap-2">
        {[...sessions].reverse().map((s, i) => (
          <li key={i}>
            <Link
              href={`/app/roasts/${s.roastId}`}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-2 text-sm hover:border-neutral-400"
            >
              <span>{s.coffeeName}</span>
              <span className="text-neutral-500">
                {new Date(s.cuppedAt).toLocaleDateString()} · {s.score.toFixed(2)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
