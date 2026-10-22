/// tRPC puts a zod failure's issue list, JSON-encoded, in `error.message`.
/// Turn that into one readable sentence; leave other messages alone.
export function friendlyErrorMessage(message: string): string {
  try {
    const issues: unknown = JSON.parse(message);
    if (Array.isArray(issues) && issues.length > 0) {
      return issues
        .map((i: { path?: (string | number)[]; message?: string }) => {
          const field = i.path?.length ? `${i.path.join(".")}: ` : "";
          return `${field}${i.message ?? "invalid"}`;
        })
        .join("; ");
    }
  } catch {
    // not JSON — an ordinary message
  }
  return message;
}
