import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { AppNav } from "@/components/AppNav";
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
      <AppNav />
      <main className="flex flex-1 flex-col px-4 py-6">
        <BillingGate>{children}</BillingGate>
      </main>
    </div>
  );
}
