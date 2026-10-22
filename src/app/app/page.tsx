"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export default function RoastsPage() {
  const { data: roasts, isLoading } = trpc.roast.list.useQuery();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your roasts</h1>
        <Link
          href="/app/roasts/new"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Log a roast
        </Link>
      </div>

      {isLoading && <p className="text-sm text-neutral-500">Loading...</p>}

      {roasts?.length === 0 && (
        <p className="text-sm text-neutral-500">
          No roasts yet. Log your first one to start cupping it.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {roasts?.map((roast) => (
          <li key={roast.id}>
            <Link
              href={`/app/roasts/${roast.id}`}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-3 hover:border-neutral-400"
            >
              <div>
                <p className="font-medium">{roast.coffeeName}</p>
                <p className="text-sm text-neutral-500">
                  {new Date(roast.roastDate).toLocaleDateString()}
                  {roast.origin ? ` · ${roast.origin}` : ""}
                </p>
              </div>
              <span className="text-sm text-neutral-400">
                {roast.cuppingSessions.length} cupping{roast.cuppingSessions.length === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
