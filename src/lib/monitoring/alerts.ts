export type MonitoringLevel = "Info" | "Warning" | "Critical";

export interface MonitoringAlert {
  level: MonitoringLevel;
  message: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface AlertDeps {
  now?: () => Date;
  /// Structured log line; picked up by whatever collects stdout/stderr.
  log?: (level: MonitoringLevel, line: string) => void;
  /// Optional push to an on-call channel (Slack-compatible webhook).
  notify?: (alert: MonitoringAlert) => Promise<void>;
  /// Identical alerts inside this window are dropped, so a failing health
  /// probe polled every minute does not page every minute.
  cooldownMs?: number;
  keep?: number;
}

const defaultLog = (level: MonitoringLevel, line: string) => {
  if (level === "Critical") console.error(line);
  else if (level === "Warning") console.warn(line);
  else console.info(line);
};

export function webhookNotifier(url: string, fetchImpl: typeof fetch = fetch) {
  return async (alert: MonitoringAlert) => {
    await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[${alert.level}] Cup Form: ${alert.message}` }),
      signal: AbortSignal.timeout(3000),
    });
  };
}

/// Op_RaiseMonitoringAlert. Alerting must never break the code path that
/// raised it, so delivery failures are swallowed (and logged).
export function createAlertRaiser(deps: AlertDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? defaultLog;
  const cooldownMs = deps.cooldownMs ?? 5 * 60_000;
  const keep = deps.keep ?? 100;
  const alerts: MonitoringAlert[] = [];
  const lastRaised = new Map<string, number>();

  async function raise(level: MonitoringLevel, message: string, details?: Record<string, unknown>) {
    const timestamp = now();
    const key = `${level}:${message}`;
    const last = lastRaised.get(key);
    if (last !== undefined && timestamp.getTime() - last < cooldownMs) return false;
    lastRaised.set(key, timestamp.getTime());

    const alert: MonitoringAlert = { level, message, timestamp, details };
    alerts.push(alert);
    if (alerts.length > keep) alerts.shift();

    log(level, JSON.stringify({ type: "monitoring_alert", level, message, timestamp: timestamp.toISOString(), ...details }));
    try {
      await deps.notify?.(alert);
    } catch (err) {
      log("Warning", JSON.stringify({ type: "monitoring_notify_failed", error: String(err) }));
    }
    return true;
  }

  return { raise, recent: () => [...alerts] };
}

let defaultRaiser: ReturnType<typeof createAlertRaiser> | undefined;

/// Process-wide raiser; the optional webhook comes from MONITORING_WEBHOOK_URL.
export function raiseMonitoringAlert(level: MonitoringLevel, message: string, details?: Record<string, unknown>) {
  const url = process.env.MONITORING_WEBHOOK_URL;
  defaultRaiser ??= createAlertRaiser({ notify: url ? webhookNotifier(url) : undefined });
  return defaultRaiser.raise(level, message, details);
}
