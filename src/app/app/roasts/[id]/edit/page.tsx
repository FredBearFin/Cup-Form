"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { RoastForm } from "@/components/RoastForm";
import { QueryError } from "@/components/QueryError";
import { roastToFormValues, toRoastPayload } from "@/lib/roast/form";

export default function EditRoastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();
  const roastQuery = trpc.roast.byId.useQuery({ id });
  const updateRoast = trpc.roast.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.roast.byId.invalidate({ id }), utils.roast.list.invalidate()]);
      router.push(`/app/roasts/${id}`);
    },
  });

  if (roastQuery.isError) {
    return (
      <QueryError error={roastQuery.error} notFoundMessage="Roast not found." onRetry={() => roastQuery.refetch()} />
    );
  }
  if (!roastQuery.data) return <p className="text-sm text-neutral-500">Loading...</p>;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit roast</h1>
        <Link href={`/app/roasts/${id}`} className="text-sm text-neutral-500 underline">
          Cancel
        </Link>
      </div>
      <RoastForm
        initialValues={roastToFormValues(roastQuery.data)}
        submitLabel="Save changes"
        isPending={updateRoast.isPending}
        errorMessage={updateRoast.error?.message}
        onSubmit={(values) => updateRoast.mutate({ id, ...toRoastPayload(values, null) })}
      />
    </div>
  );
}
