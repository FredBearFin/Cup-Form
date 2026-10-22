export type RouteAccess = "protected" | "auth" | "public";

const matchesSegment = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/// Access model enforced by the proxy: everything under /app requires a
/// session, /login is for signed-out users, and the rest (landing page,
/// /auth/callback, API routes that authenticate themselves) is public.
export function classifyRoute(pathname: string): RouteAccess {
  if (matchesSegment(pathname, "/app")) return "protected";
  if (matchesSegment(pathname, "/login")) return "auth";
  return "public";
}
