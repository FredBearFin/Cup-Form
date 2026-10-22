// Smoke test against a running server: `BASE_URL=http://localhost:3000 npm run check:smoke`.
// Needs no live Supabase/Stripe/DB — it checks route wiring only.
import { Report } from "./lib/report.ts";

const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const report = new Report(`Smoke test (${base})`);

const get = (path: string, init?: RequestInit) =>
  fetch(base + path, { redirect: "manual", ...init });

await report.run("/login renders", async () => {
  const res = await get("/login");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
});

await report.run("/app redirects to /login when unauthenticated", async () => {
  const res = await get("/app");
  const location = res.headers.get("location") ?? "";
  if (res.status < 300 || res.status >= 400 || new URL(location, base).pathname !== "/login") {
    throw new Error(`status ${res.status}, location ${location || "(none)"}`);
  }
});

await report.run("/app/history is protected too", async () => {
  const res = await get("/app/history");
  if (new URL(res.headers.get("location") ?? "/", base).pathname !== "/login") {
    throw new Error(`status ${res.status}`);
  }
});

await report.run("/auth/callback without a code does not crash", async () => {
  const res = await get("/auth/callback");
  if (res.status >= 500) throw new Error(`status ${res.status}`);
});

await report.run("/api/stripe/webhook rejects unsigned requests", async () => {
  const res = await get("/api/stripe/webhook", { method: "POST", body: "{}" });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

await report.run("/api/trpc rejects unauthenticated protected calls", async () => {
  const res = await get("/api/trpc/roast.list");
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

await report.run("PWA manifest loads", async () => {
  const res = await get("/manifest.webmanifest");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  await res.json();
});

report.finish();
