"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useToast } from "@/components/ToastProvider";

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export function BillingGate({ children }: { children: React.ReactNode }) {
  const { data: subscription, isLoading } = trpc.subscription.me.useQuery();
  const toast = useToast();
  const [pending, setPending] = useState<"monthly" | "annual" | null>(null);

  if (isLoading) return <p className="text-sm text-neutral-500">Loading...</p>;

  const isActive = subscription && ACTIVE_STATUSES.has(subscription.status);
  const trialExpired =
    subscription?.status === "trialing" &&
    subscription.trialEndsAt &&
    new Date(subscription.trialEndsAt) < new Date();

  if (isActive && !trialExpired) return <>{children}</>;

  async function startCheckout(plan: "monthly" | "annual") {
    setPending(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 py-12 text-center">
      <h2 className="text-xl font-semibold">Your trial has ended</h2>
      <p className="text-sm text-neutral-500">
        Subscribe to keep logging roasts and cupping scores.
      </p>
      <div className="flex w-full flex-col gap-2">
        <button
          onClick={() => startCheckout("annual")}
          disabled={pending !== null}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending === "annual" ? "Redirecting..." : "Annual — $39.99–$59.99/yr"}
        </button>
        <button
          onClick={() => startCheckout("monthly")}
          disabled={pending !== null}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending === "monthly" ? "Redirecting..." : "Monthly — $6.99–$9.99/mo"}
        </button>
      </div>
    </div>
  );
}
