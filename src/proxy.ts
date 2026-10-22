import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// /api/stripe/webhook and /api/health authenticate themselves (signature /
// no data) and must keep working when Supabase auth is unreachable.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/stripe/webhook|api/health|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
