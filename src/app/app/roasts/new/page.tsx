"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { RoastForm } from "@/components/RoastForm";
import { emptyRoastForm, toRoastPayload } from "@/lib/roast/form";

export default function NewRoastPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const createRoast = trpc.roast.create.useMutation({
    onSuccess: async (roast) => {
      await utils.roast.list.invalidate();
      router.push(`/app/roasts/${roast.id}`);
    },
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="mb-4 text-xl font-semibold">Log a roast</h1>
      <RoastForm
        initialValues={emptyRoastForm()}
        submitLabel="Save roast"
        isPending={createRoast.isPending}
        errorMessage={createRoast.error?.message}
        onSubmit={(values) => createRoast.mutate(toRoastPayload(values, undefined))}
      />
    </div>
  );
}
