/**
 * Structured logger (spec section 100).
 *
 * Records include: timestamp, workspaceId, sessionId, provider, operation,
 * severity, duration, result. Secrets are never logged — values assigned to
 * redacted field names are dropped at emit time, and there is deliberately no
 * "raw" passthrough.
 */
import type { LogRecord, LogSeverity, ObservabilityProvider } from "@proagents/contracts";

const REDACTED_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authorization",
  "apikey",
  "api_key",
  "npm_token",
]);

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(operation: string, fields?: Record<string, unknown>): void;
  info(operation: string, fields?: Record<string, unknown>): void;
  warn(operation: string, fields?: Record<string, unknown>): void;
  error(operation: string, fields?: Record<string, unknown>): void;
  child(bindings: { workspaceId?: string; sessionId?: string; provider?: string }): Logger;
}

export class StructuredLogger implements Logger {
  private readonly bindings: { workspaceId?: string; sessionId?: string; provider?: string };
  private readonly sinks: LogSink[];
  private readonly minSeverity: LogSeverity;

  constructor(
    sinks: LogSink[],
    bindings: { workspaceId?: string; sessionId?: string; provider?: string } = {},
    minSeverity: LogSeverity = "info"
  ) {
    this.sinks = sinks;
    this.bindings = bindings;
    this.minSeverity = minSeverity;
  }

  private severityRank(severity: LogSeverity): number {
    return ["debug", "info", "warn", "error"].indexOf(severity);
  }

  private sanitize(fields?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (fields === undefined) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        out[key] = "[redacted]";
      } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        out[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  log(severity: LogSeverity, operation: string, fields?: Record<string, unknown>): void {
    if (this.severityRank(severity) < this.severityRank(this.minSeverity)) return;
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      ...(this.bindings.workspaceId !== undefined ? { workspaceId: this.bindings.workspaceId } : {}),
      ...(this.bindings.sessionId !== undefined ? { sessionId: this.bindings.sessionId } : {}),
      ...(this.bindings.provider !== undefined ? { provider: this.bindings.provider } : {}),
      operation,
      severity,
      ...this.sanitize(fields),
    };
    for (const sink of this.sinks) sink(record);
  }

  debug(operation: string, fields?: Record<string, unknown>): void {
    this.log("debug", operation, fields);
  }
  info(operation: string, fields?: Record<string, unknown>): void {
    this.log("info", operation, fields);
  }
  warn(operation: string, fields?: Record<string, unknown>): void {
    this.log("warn", operation, fields);
  }
  error(operation: string, fields?: Record<string, unknown>): void {
    this.log("error", operation, fields);
  }

  child(bindings: { workspaceId?: string; sessionId?: string; provider?: string }): Logger {
    return new StructuredLogger(this.sinks, { ...this.bindings, ...bindings }, this.minSeverity);
  }
}

/**
 * Bridge that forwards log records to an observability provider plugin once
 * one is registered — logging itself is a capability (spec section 9).
 */
export function observabilitySink(provider: ObservabilityProvider): LogSink {
  return (record) => {
    void provider.write(record).catch(() => {
      /* observability must never take the workspace down */
    });
  };
}
