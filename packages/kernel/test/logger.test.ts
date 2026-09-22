import { describe, expect, it } from "vitest";
import { StructuredLogger } from "../src/logger.js";

describe("StructuredLogger", () => {
  it("emits structured records with timestamp, severity and operation", () => {
    const records: unknown[] = [];
    const logger = new StructuredLogger([(r) => records.push(r)]);
    logger.info("test/op", { durationMs: 12, result: "ok" });
    expect(records).toHaveLength(1);
    const record = records[0] as { timestamp: string; severity: string; operation: string };
    expect(record.timestamp).toBeTruthy();
    expect(record.severity).toBe("info");
    expect(record.operation).toBe("test/op");
  });

  it("redacts secret-named fields — secrets are never logged (spec section 100)", () => {
    const records: unknown[] = [];
    const logger = new StructuredLogger([(r) => records.push(r)]);
    logger.info("deploy", { token: "ghp_supersecret", NPM_TOKEN: "npm_abc", nested: { apiKey: "x" } });
    const record = records[0] as { token: string; NPM_TOKEN: string; nested: { apiKey: string } };
    expect(record.token).toBe("[redacted]");
    expect(record.NPM_TOKEN).toBe("[redacted]");
    expect(record.nested.apiKey).toBe("[redacted]");
  });

  it("redacts additional credential field names", () => {
    const records: unknown[] = [];
    const logger = new StructuredLogger([(r) => records.push(r)]);
    logger.info("credentials", {
      accessToken: "a",
      access_token: "b",
      clientSecret: "c",
      privateKey: "d",
      bearer: "e",
      Authorization: "f",
    });
    const record = records[0] as Record<string, string>;
    expect(record.accessToken).toBe("[redacted]");
    expect(record.access_token).toBe("[redacted]");
    expect(record.clientSecret).toBe("[redacted]");
    expect(record.privateKey).toBe("[redacted]");
    expect(record.bearer).toBe("[redacted]");
    expect(record.Authorization).toBe("[redacted]");
  });

  it("redacts credentials nested inside arrays", () => {
    const records: unknown[] = [];
    const logger = new StructuredLogger([(r) => records.push(r)]);
    logger.info("batch", { items: [{ id: 1, token: "supersecret" }, { id: 2 }] });
    const record = records[0] as { items: { id: number; token?: string }[] };
    expect(record.items[0]?.token).toBe("[redacted]");
    expect(record.items[1]).toEqual({ id: 2 });
  });

  it("child loggers carry provider/session bindings", () => {
    const records: unknown[] = [];
    const logger = new StructuredLogger([(r) => records.push(r)]);
    logger.child({ provider: "docker", sessionId: "s1" }).warn("runtime/exec", { exitCode: 1 });
    const record = records[0] as { provider?: string; sessionId?: string; severity: string };
    expect(record.provider).toBe("docker");
    expect(record.sessionId).toBe("s1");
    expect(record.severity).toBe("warn");
  });

  it("respects the minimum severity", () => {
    const records: unknown[] = [];
    const logger = new StructuredLogger([(r) => records.push(r)], {}, "warn");
    logger.debug("quiet");
    logger.info("also-quiet");
    logger.error("loud");
    expect(records).toHaveLength(1);
  });
});
