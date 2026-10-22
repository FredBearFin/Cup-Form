"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { QueryError } from "@/components/QueryError";
import { roastLevelLabel } from "@/lib/roast/enums";

const fmt = (n: number | null) => (n === null ? "—" : String(n));

function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-neutral-400">—</span>;
  if (delta === 0) return <span className="text-neutral-500">=</span>;
  const rounded = Math.round(delta * 100) / 100;
  // Sign and symbol, not just colour, so it reads without colour vision.
  return rounded > 0 ? (
    <span className="font-medium text-green-700">▲ +{rounded}</span>
  ) : (
    <span className="font-medium text-red-700">▼ {rounded}</span>
  );
}

/// Op_ComputeRoastComparison, rendered: per-attribute latest scores for two
/// roasts side by side with colour-coded differences (B relative to A).
export function CompareView({ roastIdA, roastIdB }: { roastIdA: string; roastIdB: string }) {
  const { data, error, isLoading } = trpc.roast.compare.useQuery({ roastIdA, roastIdB }, { retry: false });

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <QueryError error={error} notFoundMessage="One of these roasts could not be found." />
        <Link href="/app" className="text-sm underline">
          Back to roasts
        </Link>
      </div>
    );
  }
  if (isLoading || !data) return <p className="text-sm text-neutral-500">Loading...</p>;

  const { roastA, roastB, shared, rows } = data;
  const sharedLabels = shared.map((d) =>
    d === "roastLevel" ? `roast level (${roastLevelLabel(roastA.roastLevel!)})` : `${d} (${roastA[d]})`,
  );
  const scored = rows.some((r) => r.a !== null || r.b !== null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link href="/app" className="text-sm text-neutral-500 underline">
          ← Roasts
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Compare roasts</h1>
        <p className="text-sm text-neutral-500">Shared: {sharedLabels.join(", ")}. Scores are each roast’s latest cupping.</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            <th className="py-2 pr-2 font-medium">Attribute</th>
            <th className="px-2 py-2 text-right font-medium">
              <Link href={`/app/roasts/${roastA.id}`} className="underline">
                {roastA.coffeeName}
              </Link>
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <Link href={`/app/roasts/${roastB.id}`} className="underline">
                {roastB.coffeeName}
              </Link>
            </th>
            <th className="py-2 pl-2 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-testid={`row-${row.key}`} className={`border-b border-neutral-100 ${row.delta ? "bg-neutral-50" : ""}`}>
              <td className="py-2 pr-2">{row.label}</td>
              <td className="px-2 py-2 text-right">{fmt(row.a)}</td>
              <td className="px-2 py-2 text-right">{fmt(row.b)}</td>
              <td className="py-2 pl-2 text-right">
                <Delta delta={row.delta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!scored && <p className="text-sm text-neutral-500">Neither roast has been cupped yet, so there are no scores to compare.</p>}
    </div>
  );
}
