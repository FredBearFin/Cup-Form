import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-semibold">Cup-Form</h1>
      <p className="max-w-sm text-neutral-500">
        Log your home roasts and cup them against the SCA&apos;s Coffee Value
        Assessment standard — in one simple mobile-first app.
      </p>
      <Link
        href="/login"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
      >
        Get started
      </Link>
    </main>
  );
}
