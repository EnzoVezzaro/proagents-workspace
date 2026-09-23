/**
 * Shared HTTP plumbing for the control-room server (kept dependency-free so
 * route modules and the server can import it without cycles).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { WorkspaceError } from "@proagents/contracts";

export function json(res: ServerResponse, status: number, body: unknown): void {
  try {
    const data = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(data);
  } catch {
    // Client already gone — the response surface is best-effort. The socket
    // error handlers installed in server.ts prune the client; nothing to do.
  }
}

export function errorBody(error: unknown): unknown {
  if (error instanceof WorkspaceError) {
    return { error: { ...error.toJSON() } };
  }
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
      recoverable: false,
      suggestions: [],
    },
  };
}

export async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) return {};
  return JSON.parse(raw) as unknown;
}

/** Map structured WorkspaceError codes onto HTTP statuses. */
export function wsStatus(error: unknown): number {
  if (!(error instanceof WorkspaceError)) return 500;
  switch (error.code) {
    case "WORKSPACE_NOT_FOUND":
      return 404;
    case "CONFIG_INVALID":
      return 400;
    case "SERVICE_NOT_REGISTERED":
    case "AGENT_PROVIDER_UNAVAILABLE":
    case "SANDBOX_UNAVAILABLE":
      return 503;
    case "WORKSPACE_ALREADY_MOUNTED":
    case "WORKSPACE_INVALID_STATE":
    case "APPROVAL_REQUIRED":
    case "PERMISSION_DENIED":
    case "PROTECTION_BLOCKED":
    case "SANDBOX_POLICY_VIOLATION":
    case "SHELL_COMMAND_DENIED":
      return 409;
    case "FILESYSTEM_PATH_DENIED":
      return 403;
    default:
      return 500;
  }
}

/** Run an action, mapping structured errors onto honest HTTP responses. */
export async function runWs(res: ServerResponse, action: () => Promise<unknown>): Promise<void> {
  try {
    json(res, 200, await action());
  } catch (error) {
    json(res, wsStatus(error), errorBody(error));
  }
}
