"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";

export function ManageBillingButton() {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function openPortal() {
    setPending(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url, error } = await res.json();
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error(error ?? "Could not open billing.");
    } catch {
      toast.error("Could not open billing.");
    }
    setPending(false);
  }

  return (
    <button
      onClick={openPortal}
      disabled={pending}
      className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
    >
      {pending ? "Opening..." : "Manage billing"}
    </button>
  );
}
