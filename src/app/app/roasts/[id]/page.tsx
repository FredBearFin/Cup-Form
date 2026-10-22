"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { CuppingForm } from "@/components/CuppingForm";
import { getScoringSchema } from "@/lib/scoring/schemas";

export default function RoastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: roast, isLoading } = trpc.roast.byId.useQuery({ id });
  const [showForm, setShowForm] = useState(false);

  if (isLoading) return <p className="text-sm text-neutral-500">Loading...</p>;
  if (!roast) return <p className="text-sm text-red-600">Roast not found.</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{roast.coffeeName}</h1>
        <p className="text-sm text-neutral-500">
          {new Date(roast.roastDate).toLocaleDateString()}
          {roast.origin ? ` · ${roast.origin}` : ""}
          {roast.variety ? ` · ${roast.variety}` : ""}
          {roast.process ? ` · ${roast.process}` : ""}
        </p>
        {roast.notes && <p className="mt-2 text-sm">{roast.notes}</p>}
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

        <ul className="flex flex-col gap-3">
          {roast.cuppingSessions.map((session) => {
            const schema = getScoringSchema(session.scoringSchemaVersion);
            return (
              <li key={session.id} className="rounded-md border border-neutral-200 p-3">
                <p className="text-sm text-neutral-500">
                  {new Date(session.cuppedAt).toLocaleString()} · {schema.label}
                </p>
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
