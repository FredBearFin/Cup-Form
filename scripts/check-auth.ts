import { requireValidEnv } from "./lib/require-env.ts";
import { Report } from "./lib/report.ts";

requireValidEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const report = new Report("Auth preflight");

interface AuthSettings {
  external?: { email?: boolean };
  disable_signup?: boolean;
}

let settings: AuthSettings = {};
await report.run("Supabase Auth reachable with the anon key", async () => {
  const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
  });
  if (!res.ok) throw new Error(`GET /auth/v1/settings returned ${res.status}`);
  settings = (await res.json()) as AuthSettings;
});

await report.run("Email OTP / magic link sign-in enabled in Supabase", async () => {
  if (!settings.external?.email) throw new Error("the Email provider is disabled");
  if (settings.disable_signup) return "enabled, but new signups are disabled";
});

await report.run("NEXT_PUBLIC_SITE_URL is set for this deployment", async () => {
  if (!siteUrl) throw new Error("not set; Stripe redirects fall back to the request origin");
  return `add ${siteUrl.replace(/\/$/, "")}/auth/callback to Supabase > Auth > URL Configuration > Redirect URLs`;
});

report.finish();
