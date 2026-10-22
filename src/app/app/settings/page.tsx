import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { ManageBillingButton } from "@/components/ManageBillingButton";

const fmt = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });

  let plan = "No active plan";
  if (subscription?.status === "trialing" && subscription.trialEndsAt) {
    plan = `Free trial — ends ${fmt(subscription.trialEndsAt)}`;
  } else if (subscription?.status === "active") {
    plan = subscription.currentPeriodEnd ? `Active — renews ${fmt(subscription.currentPeriodEnd)}` : "Active";
  } else if (subscription) {
    plan = subscription.status.replaceAll("_", " ");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="flex flex-col gap-1 rounded-md border border-neutral-200 p-4">
        <h2 className="text-sm font-medium text-neutral-600">Account</h2>
        <p className="text-sm">{user.email}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4">
        <h2 className="text-sm font-medium text-neutral-600">Subscription</h2>
        <p className="text-sm">{plan}</p>
        {subscription?.stripeCustomerId && <ManageBillingButton />}
      </section>
    </div>
  );
}
