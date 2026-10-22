"use client";

import { use } from "react";
import Link from "next/link";
import { z } from "zod";
import { CompareView } from "@/components/CompareView";

const idsSchema = z.object({ a: z.string().uuid(), b: z.string().uuid() });

export default function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const parsed = idsSchema.safeParse(use(searchParams));
  if (!parsed.success) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-red-600">Choose two roasts to compare from your list.</p>
        <Link href="/app" className="underline">
          Back to roasts
        </Link>
      </div>
    );
  }
  return <CompareView roastIdA={parsed.data.a} roastIdB={parsed.data.b} />;
}
