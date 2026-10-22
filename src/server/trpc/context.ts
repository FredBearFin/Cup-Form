import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    prisma,
    userId: user?.id ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
