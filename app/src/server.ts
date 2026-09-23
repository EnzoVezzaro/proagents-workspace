/**
 * Control-room server (thin dispatcher) — routes live in ./routes.ts, kernel
 * boot in ./context.ts, HTTP helpers in ./http.ts. Serves the control-room
 * UI (zero build step) and the API over a REAL kernel.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOST, PORT, boot, snapshot, feedSnapshot, sseClients } from "./context.js";
import { json, errorBody, readBody, runWs } from "./http.js";
import { agentKinds, desktopInfo, inspectAgent, lifecycleCatalog, handleAgentRoutes, handleBrowseRoutes, handleChatRoutes, handleProjectRoutes, handleTerminalRoutes, handleWorkspaceRoutes, handleWizardRoutes, handleEditorRoutes } from "./routes.js";
import { AGENT_PROFILES } from "./profiles.js";

function srcDir(): string {
  if (process.env.PAW_UI_PUBLIC_DIR !== undefined) return process.env.PAW_UI_PUBLIC_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/server.js → ../src/public; src/server.ts → ./public
  return here.endsWith("dist") ? path.join(here, "..", "src", "public") : path.join(here, "public");
}

/** Content-type map for the few static asset types the UI ships. */
function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

async function handle(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const route = `${req.method} ${url.pathname}`;

  // ---- static assets (same content-type mapping approach as DSH's web
  // client): anything under /ui/* maps into src/public. Traversal-safe:
  // the resolved path must stay inside the public dir.
  if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/ui/"))) {
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice("/ui/".length);
    const file = path.resolve(path.join(srcDir(), rel));
    if (!file.startsWith(path.resolve(srcDir()) + path.sep) && file !== path.resolve(srcDir())) {
      json(res, 403, { error: { code: "FILESYSTEM_PATH_DENIED", message: "Path escapes the UI asset root.", recoverable: false, suggestions: [] } });
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": contentType(file) });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end(`not found: ${rel}`);
    }
    return;
  }

  const body = req.method === "POST" ? await readBody(req) : {};

  if (route === "GET /api/desktop") {
    json(res, 200, desktopInfo());
    return;
  }

  // /api/fs/(browse|mkdir)?path=rel — server-side folder picker
  const browseMatch = /^\/api\/fs\/(browse|mkdir)$/.exec(url.pathname);
  if (browseMatch !== null) {
    const handled = await handleBrowseRoutes(
      req.method as string,
      browseMatch[1] as "browse" | "mkdir",
      url.searchParams.get("path") ?? "",
      body,
      res,
    );
    if (handled) return;
  }

  if (route === "GET /api/health") {
    json(res, 200, await snapshot());
    return;
  }

  if (route === "GET /api/profiles") {
    json(res, 200, { profiles: AGENT_PROFILES });
    return;
  }

  if (route === "GET /api/agents/kinds") {
    json(res, 200, await agentKinds());
    return;
  }

  if (route === "GET /api/lifecycles") {
    json(res, 200, await lifecycleCatalog());
    return;
  }

  if (route === "GET /api/events") {
    if (url.searchParams.get("stream") !== "sse") {
      json(res, 200, feedSnapshot());
      return;
    }
    const after = Number(url.searchParams.get("after") ?? "0");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`event: hello\ndata: ${JSON.stringify(feedSnapshot().seq)}\n\n`);
    // Replay anything the client missed (DSH-style single-stream resume).
    if (Number.isFinite(after) && after > 0) {
      for (const item of feedSnapshot().events) {
        if (item.seq > after) res.write(`event: kernel\ndata: ${JSON.stringify(item)}\n\n`);
      }
    }
    // A disconnecting client must never take the control room down.
    res.on("error", () => sseClients.delete(res));
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // /api/workspaces[/id/action]
  const wsMatch = /^\/api\/workspaces(?:\/([^/]+)(?:\/(mount|unmount|sessions|terminals|run-lifecycle))?)?$/.exec(url.pathname);
  if (wsMatch !== null) {
    const handled = await handleWorkspaceRoutes(
      req.method as string,
      wsMatch[1] !== undefined ? decodeURIComponent(wsMatch[1]) : undefined,
      wsMatch[2],
      body,
      res,
    );
    if (handled) return;
  }

  // POST /api/agents/hire — no id segment; must match before the generic id regex
  if (route === "POST /api/agents/hire") {
    const handled = await handleAgentRoutes("POST", "hire", undefined, body, res);
    if (handled) return;
  }

  // /api/agents/:id/inspect — inspector panel data (before prompt|stop match)
  const inspectMatch = /^\/api\/agents\/([^/]+)\/inspect$/.exec(url.pathname);
  if (inspectMatch !== null) {
    await runWs(res, async () => inspectAgent(decodeURIComponent(inspectMatch[1] as string)));
    return;
  }

  // /api/agents[/id/(prompt|stop|launch)] — hire has no id segment
  const agentMatch = /^\/api\/agents(?:\/([^/]+)(?:\/(prompt|stop|launch))?)?$/.exec(url.pathname);
  if (agentMatch !== null && route !== "GET /api/agents/kinds") {
    const handled = await handleAgentRoutes(
      req.method as string,
      agentMatch[2],
      agentMatch[1] !== undefined ? decodeURIComponent(agentMatch[1]) : undefined,
      body,
      res,
    );
    if (handled) return;
  }

  // /api/chats/:id/(settle|purge) — chat retirement (T3-style lifecycle)
  const chatMatch = /^\/api\/chats\/([^/]+)\/(settle|purge)$/.exec(url.pathname);
  if (chatMatch !== null) {
    const handled = await handleChatRoutes(
      req.method as string,
      decodeURIComponent(chatMatch[1] as string),
      chatMatch[2] as "settle" | "purge",
      body,
      res,
    );
    if (handled) return;
  }

  // /api/projects/(local|github)
  const projectMatch = /^\/api\/projects(?:\/(local|github))?$/.exec(url.pathname);
  if (projectMatch !== null) {
    const handled = await handleProjectRoutes(req.method as string, projectMatch[1], body, res);
    if (handled) return;
  }

  // /api/wizard/(crews|profiles|launch)
  const wizardMatch = /^\/api\/wizard\/(crews|profiles|launch)$/.exec(url.pathname);
  if (wizardMatch !== null) {
    const handled = await handleWizardRoutes(req.method as string, wizardMatch[1], body, res);
    if (handled) return;
  }

  // /api/workspaces/:id/terminal — create a REAL PTY in this workspace
  const ttyMatch = /^\/api\/workspaces\/([^/]+)\/terminal$/.exec(url.pathname);
  if (ttyMatch !== null) {
    const handled = await handleWorkspaceRoutes(req.method as string, decodeURIComponent(ttyMatch[1] as string), "terminal", body, res);
    if (handled) return;
  }

  // /api/terminals/:id/(stream|input|resize|close)
  const ttyIoMatch = /^\/api\/terminals\/([^/]+)\/(stream|input|resize|close)$/.exec(url.pathname);
  if (ttyIoMatch !== null) {
    const handled = await handleTerminalRoutes(
      req.method as string,
      decodeURIComponent(ttyIoMatch[1] as string),
      ttyIoMatch[2] as "stream" | "input" | "resize" | "close",
      body,
      res,
    );
    if (handled) return;
  }

  // /api/workspaces/:id/editor/(tree|file) — VS Code-like workspace view data
  const editorMatch = /^\/api\/workspaces\/([^/]+)\/editor\/(tree|file)$/.exec(url.pathname);
  if (editorMatch !== null) {
    const handled = await handleEditorRoutes(
      req.method as string,
      decodeURIComponent(editorMatch[1] as string),
      editorMatch[2],
      { ...(body as Record<string, unknown>), path: url.searchParams.get("path") ?? (body as { path?: string }).path ?? "" },
      res,
    );
    if (handled) return;
  }

  // Parent-workspace guarded shell + filesystem (existing capabilities).
  if (route === "POST /api/shell" || route === "POST /api/fs/write") {
    await boot();
    const { shellService, filesystemService } = await import("./context.js");
    const isShell = route === "POST /api/shell";
    if (isShell && (body as { command?: string }).command === undefined) {
      json(res, 400, { error: { code: "SHELL_COMMAND_DENIED", message: "Provide a non-empty `command`.", recoverable: true, suggestions: [] } });
      return;
    }
    if (!isShell && ((body as { path?: string }).path === undefined || (body as { content?: string }).content === undefined)) {
      json(res, 400, { error: { code: "FILESYSTEM_PATH_DENIED", message: "Provide both `path` and `content`.", recoverable: true, suggestions: [] } });
      return;
    }
    const state = await boot();
    const provider = isShell ? await state.client.service(shellService) : await state.client.service(filesystemService);
    if (provider === undefined) {
      json(res, 503, { error: { code: "SERVICE_NOT_REGISTERED", message: "Capability not registered (plugin not activated).", recoverable: true, suggestions: ["Add it to PAW_PLUGINS"] } });
      return;
    }
    try {
      const result = isShell
        ? await (provider as import("@proagents/contracts").ShellProvider).exec({ command: (body as { command: string }).command })
        : await (provider as import("@proagents/contracts").FilesystemProvider).write({ path: (body as { path: string }).path, content: (body as { content: string }).content });
      json(res, 200, result);
    } catch (error) {
      json(res, 409, errorBody(error));
    }
    return;
  }

  json(res, 404, { error: { code: "COMMAND_NOT_FOUND", message: `No route: ${route}`, recoverable: true, suggestions: ["See the module docstring for routes"] } });
}

const server = createServer((req, res) => {
  // A client aborting mid-request must never take the control room down:
  // ECONNRESET/EPIPE on the socket are expected here, not crashes.
  res.on("error", () => undefined);
  req.on("error", () => undefined);
  res.socket?.on("error", () => undefined);
  handle(req, res).catch((error: unknown) => {
    json(res, 500, errorBody(error));
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `paw-ui control room → http://${HOST}:${PORT}\n` +
    `  base dir:        ${process.env.PAW_UI_BASE_DIR ?? process.cwd()}\n` +
    `  workspaces env:  PAW_WORKSPACES="name=./path[=sandbox-mode],..."\n` +
    `  plugins env:     PAW_PLUGINS="filesystem,shell,git,..."\n`,
  );
});

export { server };
