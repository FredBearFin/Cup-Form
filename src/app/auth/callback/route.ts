import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";

/// Exchanges the magic-link code for a session, then upserts the
/// app-local users row (Supabase owns auth.users; we mirror id/email).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      await prisma.user.upsert({
        where: { id: data.user.id },
        create: { id: data.user.id, email: data.user.email! },
        update: { email: data.user.email! },
      });

      // Start a 14-day trial on first sign-in; leave existing subscriptions untouched.
      await prisma.subscription.upsert({
        where: { userId: data.user.id },
        create: {
          userId: data.user.id,
          status: "trialing",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
        update: {},
      });
    }
  }

  return NextResponse.redirect(`${origin}/app`);
}
