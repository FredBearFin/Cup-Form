import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { SignOutButton } from "@/components/SignOutButton";
import { BillingGate } from "@/components/BillingGate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <ServiceWorkerRegistration />
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/app">Roasts</Link>
          <Link href="/app/history">History</Link>
        </nav>
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col px-4 py-6">
        <BillingGate>{children}</BillingGate>
      </main>
    </div>
  );
}
