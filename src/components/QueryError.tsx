import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "@/server/routers/_app";

/// Error state for a failed query: a missing/foreign record reads as "not
/// found" (the API deliberately doesn't distinguish the two), anything else
/// offers a retry.
export function QueryError({
  error,
  notFoundMessage = "Not found.",
  onRetry,
}: {
  error: TRPCClientErrorLike<AppRouter>;
  notFoundMessage?: string;
  onRetry?: () => void;
}) {
  if (error.data?.code === "NOT_FOUND") {
    return <p className="text-sm text-red-600">{notFoundMessage}</p>;
  }
  return (
    <div className="flex items-center gap-3 text-sm text-red-600">
      <p>Something went wrong: {error.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-md border border-neutral-300 px-2 py-1 text-neutral-700">
          Retry
        </button>
      )}
    </div>
  );
}
