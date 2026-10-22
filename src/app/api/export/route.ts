import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roastsToCsv } from "@/lib/export/csv";
import { roastsToPdf } from "@/lib/export/pdf";
import { EXPORT_PLAN_MESSAGE } from "@/lib/billing/plans";
import { getPlanLimits } from "@/server/billing";
import { ExportNotFoundError, loadOwnedRoastsForExport } from "@/server/export";

const bodySchema = z.object({
  format: z.enum(["CSV", "PDF"]),
  roastIds: z.array(z.string().uuid()).min(1).max(500),
});

/// Op_ExportRoastData. Generates the file and streams it back as a download;
/// nothing is stored, so there is no URL to leak or expire.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inv_ExportGatedByPlan
  if (!(await getPlanLimits(prisma, user.id)).exportEnabled) {
    return NextResponse.json({ error: EXPORT_PLAN_MESSAGE }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid export request" }, { status: 400 });
  const { format, roastIds } = parsed.data;

  let roasts;
  try {
    roasts = await loadOwnedRoastsForExport(prisma, user.id, roastIds);
  } catch (err) {
    if (err instanceof ExportNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="cup-form-export-${stamp}.${format.toLowerCase()}"`,
  };

  if (format === "CSV") {
    return new Response(roastsToCsv(roasts), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  return new Response(Buffer.from(await roastsToPdf(roasts)), {
    headers: { ...headers, "Content-Type": "application/pdf" },
  });
}
