"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";

const ITEMS = [
  { label: "Dashboard", href: "/app", match: (p: string) => p === "/app" || p.startsWith("/app/roasts") || p.startsWith("/app/compare") },
  { label: "History", href: "/app/history", match: (p: string) => p.startsWith("/app/history") },
  { label: "Settings", href: "/app/settings", match: (p: string) => p.startsWith("/app/settings") },
] as const;

/// Header navigation. On small screens the links collapse behind a menu
/// button (navExpanded); from `md` up they are always shown. The menu closes
/// on navigation without an effect: it records the path it was opened on and
/// is "expanded" only while the current path is still that one.
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [expandedAt, setExpandedAt] = useState<string | null>(null);
  const navExpanded = expandedAt === pathname;

  async function signOut() {
    const { error } = await createSupabaseBrowserClient().auth.signOut();
    if (error) {
      toast.error("Could not sign out. Please try again.");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  const linkClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium md:py-1.5 ${
      active ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
    }`;

  return (
    <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-neutral-200 px-4 py-2">
      <Link href="/app" className="text-sm font-semibold">
        Cup-Form
      </Link>
      <button
        onClick={() => setExpandedAt(navExpanded ? null : pathname)}
        aria-expanded={navExpanded}
        aria-controls="app-nav"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm md:hidden"
      >
        {navExpanded ? "Close" : "Menu"}
      </button>
      <nav
        id="app-nav"
        aria-label="Main"
        className={`${navExpanded ? "flex" : "hidden"} w-full flex-col gap-1 pb-2 md:flex md:w-auto md:flex-row md:items-center md:pb-0`}
      >
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
              {item.label}
            </Link>
          );
        })}
        <button onClick={signOut} className="rounded-md px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 md:py-1.5">
          Sign out
        </button>
      </nav>
    </header>
  );
}
