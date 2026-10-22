"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useToast } from "@/components/ToastProvider";
import { ManageBillingButton } from "@/components/ManageBillingButton";

export const PAYMENT_FAILED_MESSAGE = "Payment failed — update your billing details";

/// Surfaces billing state above the app. It never blocks the app: without a
/// paid plan the user is on Free, and the server enforces that tier's limits
/// (Op_EnforcePlanLimitOnRoastCreate), so this only explains and offers the way out.
export function BillingStatus({ children }: { children: React.ReactNode }) {
  const { data: subscription } = trpc.subscription.me.useQuery();
  const { data: plan } = trpc.subscription.plan.useQuery();
  const toast = useToast();
  const [pending, setPending] = useState<"monthly" | "annual" | null>(null);

  // Op_HandleBillingFailure's toast, once per page load rather than on every refetch.
  const pastDue = subscription?.status === "past_due";
  const warned = useRef(false);
  useEffect(() => {
    if (pastDue && !warned.current) {
      warned.current = true;
      toast.warning(PAYMENT_FAILED_MESSAGE);
    }
  }, [pastDue, toast]);

  async function startCheckout(target: "monthly" | "annual") {
    setPending(target);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: target }),
      });
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
        return;
      }
    } catch {
      // fall through to the error toast
    }
    toast.error("Could not start checkout. Please try again.");
    setPending(null);
  }

  const free = plan?.limits.tier === "free";
  const maxRoasts = plan?.limits.maxRoasts ?? null;
  const atLimit = free && maxRoasts !== null && plan!.usage.roasts >= maxRoasts;

  return (
    <>
      {pastDue && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{PAYMENT_FAILED_MESSAGE}</span>
          <ManageBillingButton />
        </div>
      )}
      {free && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 px-4 py-3 text-sm">
          <span className={atLimit ? "font-medium text-red-700" : "text-neutral-600"}>
            {maxRoasts !== null && `Free plan — ${plan!.usage.roasts} of ${maxRoasts} roasts used.`}
            {atLimit && " Upgrade to add more."}
          </span>
          <span className="flex gap-2">
            <button
              onClick={() => startCheckout("annual")}
              disabled={pending !== null}
              className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {pending === "annual" ? "Redirecting..." : "Upgrade — annual"}
            </button>
            <button
              onClick={() => startCheckout("monthly")}
              disabled={pending !== null}
              className="rounded-md border border-neutral-300 px-3 py-1.5 font-medium disabled:opacity-50"
            >
              {pending === "monthly" ? "Redirecting..." : "Monthly"}
            </button>
          </span>
        </div>
      )}
      {children}
    </>
  );
}
