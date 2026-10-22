"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { CuppingForm } from "@/components/CuppingForm";
import { QueryError } from "@/components/QueryError";
import { ScoreTrendChart } from "@/components/ScoreTrendChart";
import { getScoringSchema } from "@/lib/scoring/schemas";
import { scoreOf, TREND_ATTRIBUTE_KEY } from "@/lib/scoring/derive";
import { roastLevelLabel } from "@/lib/roast/enums";

export default function RoastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();
  const roastQuery = trpc.roast.byId.useQuery({ id });
  const [showForm, setShowForm] = useState(false);

  const deleteRoast = trpc.roast.delete.useMutation({
    onSuccess: async () => {
      await utils.roast.list.invalidate();
      router.push("/app");
    },
  });
  const deleteSession = trpc.cupping.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.roast.byId.invalidate({ id }), utils.roast.list.invalidate()]);
    },
  });

  if (roastQuery.isError) {
    return (
      <QueryError error={roastQuery.error} notFoundMessage="Roast not found." onRetry={() => roastQuery.refetch()} />
    );
  }
  const roast = roastQuery.data;
  if (!roast) return <p className="text-sm text-neutral-500">Loading...</p>;

  const trendData = roast.cuppingSessions.flatMap((session) => {
    const score = scoreOf(session, TREND_ATTRIBUTE_KEY);
    if (score === null) return [];
    const cuppedAt = new Date(session.cuppedAt);
    return [
      {
        date: cuppedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        label: cuppedAt.toLocaleString(),
        score,
      },
    ];
  });

  function confirmDeleteRoast() {
    const n = roast!.cuppingSessions.length;
    const detail = n > 0 ? ` and its ${n} cupping session${n === 1 ? "" : "s"}` : "";
    if (window.confirm(`Delete "${roast!.coffeeName}"${detail}? This can't be undone.`)) {
      deleteRoast.mutate({ id });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">{roast.coffeeName}</h1>
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/app/roasts/${id}/edit`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            >
              Edit
            </Link>
            <button
              onClick={confirmDeleteRoast}
              disabled={deleteRoast.isPending}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
            >
              {deleteRoast.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
        <p className="text-sm text-neutral-500">
          {new Date(roast.roastDate).toLocaleDateString(undefined, { timeZone: "UTC" })}
          {roast.origin ? ` · ${roast.origin}` : ""}
          {roast.variety ? ` · ${roast.variety}` : ""}
          {roast.process ? ` · ${roast.process}` : ""}
          {roast.roastLevel ? ` · ${roastLevelLabel(roast.roastLevel)}` : ""}
        </p>
        {roast.notes && <p className="mt-2 text-sm">{roast.notes}</p>}
        {deleteRoast.isError && <p className="mt-2 text-sm text-red-600">{deleteRoast.error.message}</p>}
      </div>

      <div className="rounded-md border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-600">Overall quality over time</h2>
        <ScoreTrendChart data={trendData} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Cupping sessions</h2>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            {showForm ? "Cancel" : "New cupping"}
          </button>
        </div>

        {showForm && (
          <div className="mb-4">
            <CuppingForm roastId={roast.id} onSaved={() => setShowForm(false)} />
          </div>
        )}

        {roast.cuppingSessions.length === 0 && !showForm && (
          <p className="text-sm text-neutral-500">No cuppings logged for this roast yet.</p>
        )}

        {deleteSession.isError && <p className="mb-2 text-sm text-red-600">{deleteSession.error.message}</p>}

        <ul className="flex flex-col gap-3">
          {roast.cuppingSessions.map((session) => {
            const schema = getScoringSchema(session.scoringSchemaVersion);
            return (
              <li key={session.id} className="rounded-md border border-neutral-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-neutral-500">
                    {new Date(session.cuppedAt).toLocaleString()} · {schema.label}
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm("Delete this cupping session? This can't be undone.")) {
                        deleteSession.mutate({ id: session.id });
                      }
                    }}
                    disabled={deleteSession.isPending && deleteSession.variables?.id === session.id}
                    className="text-sm text-red-700 underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  {session.scores.map((score) => {
                    const attr = [...schema.descriptive, ...schema.affective].find(
                      (a) => a.key === score.attributeKey,
                    );
                    return (
                      <div key={score.id} className="flex justify-between">
                        <span className="text-neutral-500">{attr?.label ?? score.attributeKey}</span>
                        <span className="font-medium">{score.value}</span>
                      </div>
                    );
                  })}
                </div>
                {session.overallNote && <p className="mt-2 text-sm">{session.overallNote}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
