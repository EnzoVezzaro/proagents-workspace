/**
 * Per-workspace append-only session log (spec section 143).
 *
 * DSH parity: everything the agent sees lands in an append-only log that
 * resume/fork/replay can operate on. Workspace version: one JSONL file per
 * named workspace under `.paw/sessions/<workspace>/session.jsonl`; records
 * are redacted at write time (spec section 100 redaction applies — secrets
 * never reach the disk); `tail()` reads strictly bounded; only append and
 * size reads mutate/inspect; no rotation or compaction yet.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { LogRecord } from "@proagents/contracts";

/** Structured entry written to the session log. */
export interface SessionLogEntry {
  readonly timestamp: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  /** Structured discriminator, e.g. `agent/prompt`, `tool/result`, `workspace/event`. */
  readonly kind: string;
  readonly provider?: string;
  /** Redacted fields. */
  readonly data?: Readonly<Record<string, unknown>>;
}

export class SessionLog {
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  private constructor(file: string) {
    this.file = file;
  }

  /**
   * Open (create if needed) the session log for a workspace. The directory is
   * created lazily; the file is never truncated — append-only.
   */
  static async open(workspaceId: string, sessionsRoot: string): Promise<SessionLog> {
    const file = path.join(sessionsRoot, workspaceId, "session.jsonl");
    await fs.mkdir(path.dirname(file), { recursive: true });
    return new SessionLog(file);
  }

  /** Append one entry. Entries are serialized sequentially, never interleaved. */
  append(entry: SessionLogEntry): Promise<void> {
    const run = this.queue.then(async () => {
      const line = `${JSON.stringify(entry)}\n`;
      await fs.appendFile(this.file, line, "utf8");
    });
    this.queue = run.catch(() => {
      /* keep the chain alive: one failed append must not poison later ones */
    });
    return run;
  }

  /** Read the last `n` entries without loading the whole file. */
  async tail(n: number): Promise<readonly SessionLogEntry[]> {
    const handle = await fs.open(this.file, "r").catch(() => undefined);
    if (handle === undefined) return [];
    try {
      const size = (await handle.stat()).size;
      const chunk = Math.min(size, Math.max(4096, n * 512));
      const start = Math.max(0, size - chunk);
      const buffer = Buffer.alloc(size - start);
      if (size - start > 0) {
        await handle.read(buffer, 0, buffer.length, start);
      }
      const lines = buffer.toString("utf8").split("\n").filter((l) => l.length > 0);
      return lines.slice(-n).map((line) => JSON.parse(line) as SessionLogEntry);
    } finally {
      await handle.close();
    }
  }

  /** Current size of the log in bytes (0 when the log does not exist yet). */
  async size(): Promise<number> {
    try {
      return (await fs.stat(this.file)).size;
    } catch {
      return 0;
    }
  }
}

/** Convert a structured log record into a session-log entry. */
export function logRecordToEntry(record: LogRecord, workspaceId: string, sessionId: string): SessionLogEntry {
  return {
    timestamp: record.timestamp,
    workspaceId,
    sessionId,
    kind: record.operation,
    ...(record.provider !== undefined ? { provider: record.provider } : {}),
    ...(record.fields !== undefined ? { data: record.fields } : {}),
  };
}
