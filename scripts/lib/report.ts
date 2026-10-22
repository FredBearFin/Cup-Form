// Tiny reporting helper shared by the preflight scripts.
export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export class Report {
  readonly checks: Check[] = [];

  // Plain field, not a constructor parameter property: Node's type
  // stripping only supports erasable TypeScript syntax.
  private readonly title: string;

  constructor(title: string) {
    this.title = title;
  }

  record(name: string, ok: boolean, detail?: string) {
    this.checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  }

  /// Records the outcome of an async check; a throw is a failed check.
  async run(name: string, fn: () => Promise<string | void>) {
    try {
      this.record(name, true, (await fn()) || undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Prisma errors lead with a multi-line invocation dump; the useful
      // part is the last non-empty line(s).
      const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
      this.record(name, false, lines.slice(-2).join(" "));
    }
  }

  finish(): never {
    const failed = this.checks.filter((c) => !c.ok).length;
    console.log(`\n${this.title}: ${this.checks.length - failed}/${this.checks.length} checks passed`);
    process.exit(failed === 0 ? 0 : 1);
  }
}
