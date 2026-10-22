"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

export default function NewRoastPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const createRoast = trpc.roast.create.useMutation({
    onSuccess: async (roast) => {
      await utils.roast.list.invalidate();
      router.push(`/app/roasts/${roast.id}`);
    },
  });

  const [form, setForm] = useState({
    coffeeName: "",
    origin: "",
    variety: "",
    process: "",
    roastDate: new Date().toISOString().slice(0, 10),
    batchSizeG: "",
    roastLevel: "",
    roastTimeS: "",
    notes: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createRoast.mutate({
      coffeeName: form.coffeeName,
      origin: form.origin || undefined,
      variety: form.variety || undefined,
      process: form.process || undefined,
      roastDate: new Date(form.roastDate),
      batchSizeG: form.batchSizeG ? Number(form.batchSizeG) : undefined,
      roastLevel: form.roastLevel || undefined,
      roastTimeS: form.roastTimeS ? Number(form.roastTimeS) : undefined,
      notes: form.notes || undefined,
    });
  }

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="mb-4 text-xl font-semibold">Log a roast</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Coffee name
          <input required className="rounded-md border border-neutral-300 px-3 py-2" {...field("coffeeName")} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Origin
          <input className="rounded-md border border-neutral-300 px-3 py-2" {...field("origin")} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Variety
          <input className="rounded-md border border-neutral-300 px-3 py-2" {...field("variety")} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Process
          <input className="rounded-md border border-neutral-300 px-3 py-2" {...field("process")} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Roast date
          <input type="date" required className="rounded-md border border-neutral-300 px-3 py-2" {...field("roastDate")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Batch size (g)
            <input type="number" min={0} className="rounded-md border border-neutral-300 px-3 py-2" {...field("batchSizeG")} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Roast time (s)
            <input type="number" min={0} className="rounded-md border border-neutral-300 px-3 py-2" {...field("roastTimeS")} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Roast level
          <input placeholder="e.g. City+, Full City" className="rounded-md border border-neutral-300 px-3 py-2" {...field("roastLevel")} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Notes
          <textarea rows={3} className="rounded-md border border-neutral-300 px-3 py-2" {...field("notes")} />
        </label>

        <button
          type="submit"
          disabled={createRoast.isPending}
          className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {createRoast.isPending ? "Saving..." : "Save roast"}
        </button>
        {createRoast.isError && (
          <p className="text-sm text-red-600">{createRoast.error.message}</p>
        )}
      </form>
    </div>
  );
}
