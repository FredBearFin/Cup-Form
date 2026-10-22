"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  allAttributes,
  cvaV1,
  DEFAULT_SCORING_SCHEMA_VERSION,
  type ScoringAttribute,
} from "@/lib/scoring/schemas";

function AttributeSlider({
  attribute,
  value,
  onChange,
}: {
  attribute: ScoringAttribute;
  value: number;
  onChange: (value: number) => void;
}) {
  const nearestDescriptor =
    attribute.descriptors &&
    Object.entries(attribute.descriptors)
      .map(([k, v]) => [Number(k), v] as const)
      .sort((a, b) => Math.abs(a[0] - value) - Math.abs(b[0] - value))[0]?.[1];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{attribute.label}</span>
        <span className="text-neutral-500">
          {value.toFixed(2)} {nearestDescriptor ? `· ${nearestDescriptor}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={attribute.min}
        max={attribute.max}
        step={attribute.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function CuppingForm({ roastId, onSaved }: { roastId: string; onSaved?: () => void }) {
  const schema = cvaV1; // Only one schema version shipped in Phase 1; future versions select here.
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(allAttributes(schema).map((a) => [a.key, (a.min + a.max) / 2])),
  );
  const [overallNote, setOverallNote] = useState("");

  const utils = trpc.useUtils();
  const createSession = trpc.cupping.create.useMutation({
    onSuccess: async () => {
      await utils.roast.byId.invalidate({ id: roastId });
      await utils.roast.list.invalidate();
      onSaved?.();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createSession.mutate({
      roastId,
      scoringSchemaVersion: DEFAULT_SCORING_SCHEMA_VERSION,
      overallNote: overallNote || undefined,
      scores: Object.entries(values).map(([attributeKey, value]) => ({ attributeKey, value })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-md border border-neutral-200 p-4">
      <div>
        <h3 className="font-medium">Descriptive assessment</h3>
        <p className="text-sm text-neutral-500">Rate attribute intensities (SCA-103 style).</p>
      </div>
      <div className="flex flex-col gap-4">
        {schema.descriptive.map((attr) => (
          <AttributeSlider
            key={attr.key}
            attribute={attr}
            value={values[attr.key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [attr.key]: v }))}
          />
        ))}
      </div>

      <div>
        <h3 className="font-medium">Affective assessment</h3>
        <p className="text-sm text-neutral-500">Your overall quality rating (SCA-104 style).</p>
      </div>
      <div className="flex flex-col gap-4">
        {schema.affective.map((attr) => (
          <AttributeSlider
            key={attr.key}
            attribute={attr}
            value={values[attr.key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [attr.key]: v }))}
          />
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea
          rows={3}
          value={overallNote}
          onChange={(e) => setOverallNote(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={createSession.isPending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {createSession.isPending ? "Saving..." : "Save cupping"}
      </button>
      {createSession.isError && (
        <p className="text-sm text-red-600">{createSession.error.message}</p>
      )}
    </form>
  );
}
