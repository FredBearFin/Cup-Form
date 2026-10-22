"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";

type Format = "CSV" | "PDF";

function filenameFrom(res: Response, format: Format) {
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return match?.[1] ?? `cup-form-export.${format.toLowerCase()}`;
}

/// Op_ExportRoastData: posts the selected ids, shows progress while the file
/// is generated, then downloads it and confirms with a toast. Disabled with
/// nothing selected (Inv_ExportGate); the server re-checks ownership.
export function ExportButton({ roastIds }: { roastIds: string[] }) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportInProgress, setExportInProgress] = useState(false);

  async function run(format: Format) {
    setMenuOpen(false);
    setExportInProgress(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, roastIds }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: null }));
        toast.error(error ?? "Export failed. Please try again.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(res, format);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Export ready");
    } catch {
      toast.error("Export failed. Please check your connection and try again.");
    } finally {
      setExportInProgress(false);
    }
  }

  const disabled = roastIds.length === 0 || exportInProgress;

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-busy={exportInProgress}
        title={roastIds.length === 0 ? "Select one or more roasts to export" : undefined}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {exportInProgress ? "Exporting..." : "Export"}
      </button>
      {menuOpen && (
        <div role="menu" className="absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-md border border-neutral-200 bg-white py-1 shadow-md">
          {(["CSV", "PDF"] as const).map((format) => (
            <button key={format} role="menuitem" onClick={() => run(format)} className="px-3 py-2 text-left text-sm hover:bg-neutral-100">
              Export as {format}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
