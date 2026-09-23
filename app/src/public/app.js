/**
 * ProAgents Workspace — DSH-style chat shell.
 * Every chat is a configured workspace (folder + harness + crew).
 * Chat on the left of ⌘, code (VS Code-like) on the right of ⌘.
 */
const $ = (id) => document.getElementById(id);

const state = {
  chats: [],            // hired agents (1 chat = 1 workspace = 1+ crew members)
  projects: [],
  profiles: [],
  kinds: [],
  crews: [],
  lifecycles: [],   // lifecycle library (plugin + config contributions)
  selected: null,       // chat id
  codeOpen: false,
  events: [],
};

// ---------------------------------------------------------------------------
// api
// ---------------------------------------------------------------------------

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw body && body.error ? body.error : { message: String(res.status) };
  return body;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

async function refresh() {
  const [agents, projects] = await Promise.all([api("/api/agents"), api("/api/projects")]);
  state.chats = agents.agents ?? [];
  state.projects = projects.projects ?? [];
  renderChatList();
  if (state.selected) renderChat();
}

async function refreshStatus() {
  try {
    const h = await api("/api/health");
    $("side-status").textContent = `kernel ${h.status} · ${h.workspaces.length} mounted`;
    $("sb-kernel").textContent = `kernel: ${h.status}`;
    $("sb-events").textContent = `${state.events.length} events`;
  } catch (e) {
    $("side-status").textContent = `offline: ${e.message ?? e}`;
    $("sb-kernel").textContent = "kernel: offline";
  }
}

// ---------------------------------------------------------------------------
// chat list
// ---------------------------------------------------------------------------

function chatGroup(chats) {
  // 1 chat = 1 workspace = 1 primary agent (crew members sharing a root are
  // grouped under the first). Group by workspace root.
  const byRoot = new Map();
  for (const c of chats) {
    const key = c.root;
    if (!byRoot.has(key)) byRoot.set(key, []);
    byRoot.get(key).push(c);
  }
  return [...byRoot.entries()];
}

function renderChatList() {
  const filter = ($("chat-filter").value ?? "").toLowerCase();
  const groups = chatGroup(state.chats).filter(([root, members]) =>
    filter === "" || members.some((m) => m.id.toLowerCase().includes(filter) || m.profileId.includes(filter)) || root.toLowerCase().includes(filter));
  $("chat-list").innerHTML = groups.length
    ? groups.map(([root, members]) => {
        const head = members[0];
        const settled = members.every((m) => m.status === "settled" || m.status === "stopped");
        const working = members.some((m) => m.status === "working");
        const stopped = members.every((m) => m.status === "stopped");
        const dot = working ? "working" : stopped ? "stopped" : settled ? "settled" : "hired";
        const sel = members.some((m) => m.id === state.selected) || state.selected === head.id ? "selected" : "";
        return `<li data-chat="${head.id}" class="${sel}${settled ? " settled" : ""}">
          <span class="status-dot ${dot}"></span>
          <div class="c-main">
            <div class="c-name">${escapeHtml(head.id)}${settled ? ' <span class="settled-badge">settled</span>' : ""}</div>
            <div class="c-sub">${escapeHtml(root)} · ${members.length} agent${members.length > 1 ? "s" : ""}</div>
          </div>
        </li>`;
      }).join("")
    : `<li class="muted small" style="cursor:default">no chats yet</li>`;
  if (state.selected) {
    const agent = state.chats.find((a) => a.id === state.selected);
    if (agent) $("chat-status").className = `status-dot ${agent.status}`;
  }
}

// ---------------------------------------------------------------------------
// chat view
// ---------------------------------------------------------------------------

function selectChat(id) {
  state.selected = id;
  state.codeOpen = false;
  $("code-pane").classList.add("hidden");
  $("chat-pane").style.display = "";
  $("toggle-code").textContent = "⌘ Code";
  $("view-empty").classList.add("hidden");
  $("view-chat").classList.remove("hidden");
  renderChatList();
  renderChat();
  // Follow the selected chat's workspace with the terminal pane.
  if (!$("term-panel").classList.contains("hidden")) void openTerminal();
}

function renderChat() {
  const agent = state.chats.find((a) => a.id === state.selected);
  if (!agent) { state.selected = null; $("view-chat").classList.add("hidden"); $("view-empty").classList.remove("hidden"); return; }
  $("chat-title").textContent = agent.id;
  $("chat-meta").textContent = `${agent.profileId} · ${agent.agentKind} · ${agent.root} · ${agent.sandbox}`;
  $("chat-status").className = `status-dot ${agent.status}`;
  $("sb-mode").textContent = `● ${agent.sandbox}`;
  const msgs = agent.transcript ?? [];
  $("messages").innerHTML = msgs.length
    ? msgs.map((m) => `
      <div class="msg ${m.role}">
        <div class="who">${m.role === "user" ? "YOU" : `${agent.id} · ${agent.profileId}`}</div>
        <pre class="${m.role === "agent" && m.exitCode !== 0 ? "err" : ""}">${escapeHtml(m.text)}</pre>
      </div>`).join("")
    : `<div class="muted" style="margin:auto">No messages yet — say what the crew should do.</div>`;
  const box = $("messages");
  box.scrollTop = box.scrollHeight;
  // Deferred harness (provisioning failed / not yet launched): offer the
  // one-click recovery — launch it into the live terminal.
  const launchBtn = $("chat-launch");
  if (launchBtn) launchBtn.classList.toggle("hidden", agent.status === "working");
}

async function launchHarness() {
  if (!state.selected) return;
  try {
    await api(`/api/agents/${encodeURIComponent(state.selected)}/launch`, { method: "POST", body: "{}" });
    await refresh();
    // The harness now owns the terminal — reveal it.
    if ($("term-panel").classList.contains("hidden")) void openTerminal();
  } catch (e) { alertBar(e); }
}

function sendPrompt() {
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text || !state.selected) return;
  input.value = "";
  // The message is typed into the harness running in the workspace's REAL
  // terminal — reveal the pane so the user watches the agent work.
  if ($("term-panel").classList.contains("hidden")) void openTerminal();
  api(`/api/agents/${encodeURIComponent(state.selected)}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  }).then(refresh).catch(async (e) => { $("chat-input").value = text; await refresh(); alertBar(e); });
}

// ---------------------------------------------------------------------------
// code pane (VS Code-like, bound to the chat's workspace)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// code pane (VS Code-like): file tree + TABS + dirty tracking + resizable
// split, bound to the chat's workspace
// ---------------------------------------------------------------------------

const tabs = [];            // { path, content, dirty }
let activeTab = -1;

function renderTabs() {
  $("editor-tabs").innerHTML = tabs.map((t, i) => `
    <div class="tab ${i === activeTab ? "active" : ""} ${t.dirty ? "dirty" : ""}" data-tab="${i}">
      <span class="t-dirty">●</span>${escapeHtml(t.path.split("/").pop())}
      <span class="t-close" data-close="${i}">×</span>
    </div>`).join("");
}

async function openFile(p) {
  const agent = state.chats.find((a) => a.id === state.selected);
  if (!agent) return;
  const existing = tabs.findIndex((t) => t.path === p);
  if (existing >= 0) { activeTab = existing; renderTabs(); return showTab(); }
  const res = await fetch(`/api/workspaces/${encodeURIComponent(agent.workspaceId)}/editor/file?path=${encodeURIComponent(p)}`);
  const body = await res.json();
  if (!res.ok) { $("editor-status").textContent = body.error?.message ?? "read failed"; return; }
  tabs.push({ path: p, content: body.content, dirty: false });
  activeTab = tabs.length - 1;
  if (tabs.length > 8) { tabs.shift(); activeTab = Math.max(0, activeTab - 1); }
  renderTabs();
  showTab();
}

function showTab() {
  const t = tabs[activeTab];
  if (!t) { $("editor-file-name").textContent = "no file open"; $("editor-content").value = ""; $("editor-save").disabled = true; return; }
  $("editor-file-name").textContent = t.path;
  $("editor-content").value = t.content;
  $("editor-save").disabled = false;
  $("editor-status").textContent = "";
}

$("editor-tabs")?.addEventListener("click", (ev) => {
  const close = ev.target.closest("[data-close]");
  if (close) {
    const i = Number(close.dataset.close);
    tabs.splice(i, 1);
    activeTab = Math.min(activeTab >= i ? activeTab - 1 : activeTab, tabs.length - 1);
    renderTabs();
    showTab();
    return;
  }
  const tab = ev.target.closest("[data-tab]");
  if (tab) { activeTab = Number(tab.dataset.tab); renderTabs(); showTab(); }
});

$("editor-tree")?.addEventListener("click", async (ev) => {
  const dirEl = ev.target.closest(".t-dir");
  if (dirEl) return loadTree(dirEl.dataset.dir);
  const fileEl = ev.target.closest(".t-file");
  if (!fileEl) return;
  document.querySelectorAll(".t-file.selected").forEach((el) => el.classList.remove("selected"));
  fileEl.classList.add("selected");
  await openFile(fileEl.dataset.file);
});

$("editor-content")?.addEventListener("input", () => {
  const t = tabs[activeTab];
  if (!t) return;
  t.dirty = $("editor-content").value !== t.content;
  renderTabs();
});

$("editor-save")?.addEventListener("click", async () => {
  const agent = state.chats.find((a) => a.id === state.selected);
  const t = tabs[activeTab];
  if (!agent || !t) return;
  try {
    await api(`/api/workspaces/${encodeURIComponent(agent.workspaceId)}/editor/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: t.path, content: $("editor-content").value }),
    });
    t.content = $("editor-content").value;
    t.dirty = false;
    renderTabs();
    $("editor-status").textContent = `saved ${t.path}`;
  } catch (e) {
    $("editor-status").textContent = `save refused: ${e.message}`;
  }
});

// Resizable tree/editor split (drag the divider).
$("editor-split")?.addEventListener("mousedown", (ev) => {
  ev.preventDefault();
  const pane = $("code-pane");
  const move = (e) => {
    const width = Math.min(Math.max(e.clientX - pane.getBoundingClientRect().left, 140), 520);
    pane.style.gridTemplateColumns = `${width}px 4px 1fr`;
  };
  const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});

async function toggleCode() {
  state.codeOpen = !state.codeOpen;
  $("code-pane").classList.toggle("hidden", !state.codeOpen);
  $("toggle-code").textContent = state.codeOpen ? "⌘ Chat" : "⌘ Code";
  if (state.codeOpen) await loadTree("");
}

async function loadTree(rel) {
  const agent = state.chats.find((a) => a.id === state.selected);
  if (!agent) return;
  try {
    const { entries } = await api(`/api/workspaces/${encodeURIComponent(agent.workspaceId)}/editor/tree?path=${encodeURIComponent(rel)}`);
    const tree = $("editor-tree");
    if (rel === "") tree.innerHTML = "";
    tree.innerHTML += entries.map((e) =>
      e.type === "dir"
        ? `<div class="t-dir" data-dir="${escapeHtml(e.path)}">▸ ${escapeHtml(e.name)}/</div>`
        : `<div class="t-file" data-file="${escapeHtml(e.path)}">${escapeHtml(e.name)}</div>`).join("");
    if (rel === "" && entries.length === 0) tree.innerHTML = `<div class="muted small">(empty workspace)</div>`;
  } catch (e) {
    $("editor-tree").innerHTML = `<div class="muted small">cannot list: ${escapeHtml(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// wizard (new chat = workspace config)
// ---------------------------------------------------------------------------

async function openWizard() {
  if (state.profiles.length === 0) state.profiles = (await api("/api/wizard/profiles")).profiles ?? [];
  if (state.kinds.length === 0) state.kinds = (await api("/api/agents/kinds")).kinds ?? [];
  if (state.crews.length === 0) state.crews = (await api("/api/wizard/crews")).crews ?? [];
  // Lifecycle library (spec §6/16/146): plugin contributions + config data.
  state.lifecycles = (await api("/api/lifecycles")).lifecycles ?? [];
  $("wiz-kind").innerHTML = state.kinds.map((k) => `<option value="${k.kind}" ${k.installed ? "" : "disabled"}>${k.label}${k.installed ? "" : " — not installed"}</option>`).join("");
  $("wiz-crew-template").innerHTML = state.crews.map((c, i) => `<option value="${i}">${c.label} — ${c.description}</option>`).join("");
  $("wiz-lifecycle").innerHTML = state.lifecycles.map((l) => `<option value="${l.id}">${l.name} · ${l.stages.length} stages (${l.source})</option>`).join("");
  const t = state.crews[0];
  wizardCrew = t ? t.members.map((m) => ({ ...m, agentKind: ($("wiz-kind").value || m.agentKind) })) : [];
  renderWizMembers();
  pickedFolder = null;
  setWizSource("wiz-new-empty"); // every chat starts from its own empty workspace
  $("wiz-error").classList.add("hidden");
  $("wizard-dialog").showModal();
}

let wizardCrew = [];

function renderWizMembers() {
  $("wiz-members").innerHTML = wizardCrew.map((m, i) => `
    <div class="wiz-member">
      <select data-idx="${i}" class="wz-profile">${state.profiles.map((p) => `<option value="${p.id}" ${p.id === m.profileId ? "selected" : ""}>${p.label}</option>`).join("")}</select>
      <input data-idx="${i}" class="wz-role" placeholder="role (optional)" value="${escapeHtml(m.role ?? "")}" />
      <button class="btn small danger wz-remove" data-idx="${i}">×</button>
    </div>`).join("");
}

$("wiz-members").addEventListener("change", (ev) => {
  const i = Number(ev.target.dataset.idx);
  if (!wizardCrew[i]) return;
  if (ev.target.classList.contains("wz-profile")) wizardCrew[i].profileId = ev.target.value;
  if (ev.target.classList.contains("wz-role")) wizardCrew[i].role = ev.target.value || undefined;
});
$("wiz-members").addEventListener("click", (ev) => {
  const b = ev.target.closest(".wz-remove");
  if (!b) return;
  wizardCrew.splice(Number(b.dataset.idx), 1);
  renderWizMembers();
});
$("wiz-add-member").addEventListener("click", () => {
  const p = state.profiles[0];
  if (!p) return;
  wizardCrew.push({ profileId: p.id, agentKind: $("wiz-kind").value || "dsh" });
  renderWizMembers();
});
$("wiz-crew-template").addEventListener("change", (ev) => {
  const t = state.crews[Number(ev.target.value)];
  if (t) { wizardCrew = t.members.map((m) => ({ ...m, agentKind: $("wiz-kind").value || m.agentKind })); renderWizMembers(); }
});
// Harness choice applies to every member (one harness per workspace env).
$("wiz-kind").addEventListener("change", () => {
  wizardCrew = wizardCrew.map((m) => ({ ...m, agentKind: $("wiz-kind").value }));
});

let pickedFolder = null; // base-dir-relative path chosen in the picker

// Step 1 — workspace source: empty (default), local folder COPY source, or
// GitHub repo. None of them is bound in place: the project is materialized
// INTO the chat's fresh workspace (chats/<chat-id>), so chats never mix.
function setWizSource(mode) {
  for (const b of ["wiz-new-empty", "wiz-new-local", "wiz-new-github"]) $(b).classList.toggle("active", b === mode);
  pickedFolder = null;
  if (mode === "wiz-new-empty") {
    $("wiz-project-extra").innerHTML = `<p class="muted small">Start from a blank environment — the crew fills it. A connected project can be materialized into it later from the chat.</p>`;
  } else if (mode === "wiz-new-local") {
    $("wiz-project-extra").innerHTML = `
    <label>Connected project
      <select id="wiz-project"><option value="">— pick a folder below —</option></select>
    </label>
    <div class="wiz-folder mono">
      <span id="wz-folder-label" class="muted">no folder selected</span>
      <button id="wz-browse" class="btn small">📂 Browse…</button>
    </div>
    <p class="muted small">The folder is <b>copied</b> into this chat's workspace (node_modules/.git excluded) — the original stays untouched.</p>`;
    $("wiz-project").innerHTML = `<option value="">— pick a folder below —</option>` + state.projects.map((p) => `<option value="${p.id}">${p.name} (${p.source})</option>`).join("");
    $("wz-browse").addEventListener("click", () => void openPicker((rel) => {
      pickedFolder = rel;
      $("wz-folder-label").textContent = rel || "/";
      $("wz-folder-label").classList.remove("muted");
    }));
  } else {
    $("wiz-project-extra").innerHTML = `<label>Repository<input id="wz-gh-repo" placeholder="owner/repo or https://github.com/…" /></label><label>Branch <span class="muted">(optional)</span><input id="wz-gh-branch" /></label><p class="muted small">The repo is <b>cloned into this chat's workspace</b> — each chat gets its own clone and its own branch work.</p>`;
  }
}
$("wiz-new-empty").addEventListener("click", () => setWizSource("wiz-new-empty"));
$("wiz-new-local").addEventListener("click", () => setWizSource("wiz-new-local"));
$("wiz-new-github").addEventListener("click", () => setWizSource("wiz-new-github"));

$("wiz-launch").addEventListener("click", async () => {
  const payload = { contextFramework: "acc", sandbox: $("wiz-sandbox").value, crew: wizardCrew, lifecycleRef: ($("wiz-lifecycle")?.value || undefined) };
  const name = $("wiz-name").value.trim();
  if (name) payload.name = name;
  // Empty workspace is the default — project is optional now.
  const pid = $("wiz-project")?.value;
  const gh = $("wz-gh-repo");
  const branch = $("wz-gh-branch");
  if (pickedFolder !== null) {
    payload.project = { localPath: pickedFolder };
  } else if (gh && gh.value.trim()) {
    payload.project = { github: { repo: gh.value.trim(), ...(branch && branch.value.trim() ? { branch: branch.value.trim() } : {}) } };
  } else if (pid) {
    payload.project = { id: pid };
  } // else: empty workspace chat — no project key at all
  $("wiz-launch").disabled = true;
  const originalLabel = $("wiz-launch").textContent;
  $("wiz-launch").textContent = "Provisioning… (clone → install → ACC setup)";
  try {
    const result = await api("/api/wizard/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    $("wizard-dialog").close();
    await refresh();
    if (result.crew?.length) selectChat(result.crew[0].agentId);
    // Provisioning is real now (clone + install awaited) — surface the
    // honest outcome: failure keeps a raw shell + the Launch harness button.
    if (result.provisioning && result.provisioning.ok === false) {
      alertBar({ code: "PROVISIONING_FAILED", message: `Setup step failed (${result.provisioning.failedStep}, exit ${result.provisioning.exitCode}). Fix it in the terminal, then click Launch harness.` });
    } else {
      // Success: the harness owns the workspace terminal — show it live.
      if ($("term-panel").classList.contains("hidden")) void openTerminal();
    }
  } catch (e) {
    $("wiz-error").textContent = `${e.code ?? "ERROR"}: ${e.message}`;
    $("wiz-error").classList.remove("hidden");
  } finally {
    $("wiz-launch").disabled = false;
    $("wiz-launch").textContent = originalLabel;
  }
});
$("wiz-cancel").addEventListener("click", () => $("wizard-dialog").close());

// ---------------------------------------------------------------------------
// wiring + boot
// ---------------------------------------------------------------------------

$("toggle-inspect")?.addEventListener("click", toggleInspector);
document.addEventListener("keydown", (ev) => {
  const meta = ev.metaKey || ev.ctrlKey;
  if (meta && ev.key.toLowerCase() === "i" && state.selected) { ev.preventDefault(); toggleInspector(); }
});
// Canvas/inspector refresh piggybacks on the existing poll cycle.
setInterval(() => { if (!$("view-canvas").classList.contains("hidden")) void renderCanvas(); }, 2500);
setInterval(() => { if (inspectorOpen) void renderInspector(); }, 4000);

function alertBar(e) {
  $("side-status").textContent = `${e.code ?? "ERROR"}: ${String(e.message ?? e).slice(0, 90)}`;
}

$("new-chat-btn").addEventListener("click", () => void openWizard());
$("empty-new-chat").addEventListener("click", () => void openWizard());
$("chat-send").addEventListener("click", sendPrompt);
$("chat-launch")?.addEventListener("click", () => void launchHarness());
$("chat-input").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); sendPrompt(); }
});
$("toggle-code").addEventListener("click", () => void toggleCode());
$("chat-stop").addEventListener("click", async () => {
  if (!state.selected) return;
  try { await api(`/api/agents/${encodeURIComponent(state.selected)}/stop`, { method: "POST", body: "{}" }); await refresh(); }
  catch (e) { alertBar(e); }
});
// Chat retirement (T3-style): settle parks finished work; purge deletes the
// chat's workspace for good — the server refuses while uncommitted work
// exists, and only an explicit confirm destroys it.
$("chat-settle").addEventListener("click", async () => {
  if (!state.selected) return;
  try { await api(`/api/chats/${encodeURIComponent(state.selected)}/settle`, { method: "POST", body: "{}" }); await refresh(); }
  catch (e) { alertBar(e); }
});
$("chat-purge").addEventListener("click", async () => {
  if (!state.selected) return;
  const chat = state.chats.find((c) => c.id === state.selected);
  const label = chat ? chat.id : state.selected;
  if (!confirm(`Purge chat "${label}"? Its workspace directory will be deleted for good. Uncommitted work blocks a purge — commit first.`)) return;
  try {
    const r = await api(`/api/chats/${encodeURIComponent(state.selected)}/purge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    await refresh();
    if (r.destroyedWork) alertBar({ code: "PURGED", message: `Purged ${r.purged}; uncommitted work was destroyed (forced).` });
  } catch (e) {
    // Dirty-worktree guard: offer the explicit forced purge (T3 semantics).
    if (e.code === "WORKSPACE_INVALID_STATE" && /uncommitted/.test(e.message ?? "")) {
      if (confirm(`${e.message}\n\nDestroy the uncommitted work and purge anyway?`)) {
        try {
          const r = await api(`/api/chats/${encodeURIComponent(state.selected)}/purge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }) });
          await refresh();
          alertBar({ code: "PURGED", message: `Purged ${r.purged}; uncommitted work was destroyed.` });
        } catch (e2) { alertBar(e2); }
      }
    } else alertBar(e);
  }
});
$("chat-filter").addEventListener("input", renderChatList);
$("chat-list").addEventListener("click", (ev) => {
  const li = ev.target.closest("[data-chat]");
  if (li) selectChat(li.dataset.chat);
});

// Live feed keeps the chat list honest about who is working.
let lastSeq = 0;
function connectSSE() {
  const url = lastSeq > 0 ? `/api/events?stream=sse&after=${lastSeq}` : "/api/events?stream=sse";
  const es = new EventSource(url);
  es.addEventListener("kernel", (ev) => {
    try {
      const item = JSON.parse(ev.data);
      if (typeof item.seq === "number" && item.seq <= lastSeq) return;
      lastSeq = Math.max(lastSeq, typeof item.seq === "number" ? item.seq : lastSeq);
      state.events.push(item);
      if (state.events.length > 400) state.events.shift();
      // Refresh on agent lifecycle + command events so status dots move.
      if (/^(agent|session|command|workspace)\//.test(item.name)) void refresh();
      // The Lifecycle Inspector is a pure projection over kernel events.
      if (/^lifecycle\//.test(item.name)) { trackLifecycleEvent(item); renderLifecycle(); }
    } catch { /* ignore */ }
  });
  es.addEventListener("error", () => { /* EventSource auto-reconnects */ });
}

// ---------------------------------------------------------------------------
// Lifecycle Inspector (PROAGENTS-WORKSPACE-UI.md §51): a pure projection over
// the kernel's `lifecycle/*` events — no UI-side truth, reset on refresh.
// ---------------------------------------------------------------------------

const lifecycleState = { lifecycleId: null, stages: {} }; // stageId → {status, attempts, ok, startedAt}

function trackLifecycleEvent(item) {
  const p = item.payload ?? {};
  if (item.name === "lifecycle/stage-started") {
    lifecycleState.lifecycleId = p.lifecycleId;
    lifecycleState.stages[p.stageId] = { ...(lifecycleState.stages[p.stageId] ?? {}), status: "running", attempt: p.attempt, agents: p.agentProfileIds, tools: p.toolIds };
  } else if (item.name === "lifecycle/stage-completed") {
    lifecycleState.lifecycleId = p.lifecycleId;
    lifecycleState.stages[p.stageId] = { ...(lifecycleState.stages[p.stageId] ?? {}), status: p.ok ? "done" : "failed", attempts: p.attempt };
  } else if (item.name === "lifecycle/completed") {
    lifecycleState.runOk = p.ok;
    for (const s of Object.values(lifecycleState.stages)) if (s.status === "running") s.status = "done";
  }
}

const STAGE_ORDER = ["understand", "plan", "implement", "test", "review", "ship"];

function renderLifecycle() {
  const box = $("lifecycle-rail");
  if (!box) return;
  const ids = Object.keys(lifecycleState.stages);
  if (ids.length === 0) { box.innerHTML = "<span class='muted small'>No lifecycle run yet — POST /api/workspaces/:id/run-lifecycle or wire it into launch.</span>"; return; }
  ids.sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
  box.innerHTML = ids.map((id) => {
    const s = lifecycleState.stages[id];
    const dot = s.status === "running" ? "working" : s.status === "failed" ? "stopped" : "done";
    const title = `${id}${s.attempt > 1 ? ` (attempt ${s.attempt})` : ""}`;
    return `<span class="lc-stage" title="${escapeHtml(title)}"><span class="status-dot ${dot}"></span>${escapeHtml(id)}</span>`;
  }).join("<span class='muted'>→</span>") +
  (lifecycleState.runOk === false ? " <span class='muted small'>run failed</span>" : lifecycleState.runOk === true ? " <span class='muted small'>✓</span>" : "");
}

$("lifecycle-run")?.addEventListener("click", async () => {
  if (!state.selected) return;
  const agent = state.chats.find((a) => a.id === state.selected);
  if (!agent) return;
  try {
    lifecycleState.stages = {}; lifecycleState.runOk = undefined;
    await api(`/api/workspaces/${encodeURIComponent(agent.workspaceId)}/run-lifecycle`, { method: "POST", body: "{}" });
    await refresh();
  } catch (e) { alertBar(e); }
});

connectSSE();
void refreshStatus();
void refresh();
setInterval(() => void refreshStatus(), 5000);
setInterval(() => void refresh(), 2500);

// ---------------------------------------------------------------------------
// server-side folder picker ("select folder") — browsers have no native
// directory dialog; this browses the REAL filesystem rooted at the server's
// base dir, containment-checked, with folder creation
// ---------------------------------------------------------------------------

let pickerOnSelect = null;
let pickerPath = "";
let pickerSelected = null;

async function openPicker(onSelect) {
  pickerOnSelect = onSelect;
  pickerSelected = null;
  $("picker-select").disabled = true;
  $("picker-selection").textContent = "no folder selected";
  $("picker-error").classList.add("hidden");
  $("picker-dialog").showModal();
  await browseTo("");
}

async function browseTo(rel) {
  try {
    const dir = await api(`/api/fs/browse?path=${encodeURIComponent(rel)}`);
    pickerPath = dir.path;
    $("picker-base").textContent = `Every chat workspace lives under ${dir.absolutePath} (the kernel's sandbox root)`;
    const crumbs = [["root", ""]];
    const parts = dir.path === "" ? [] : dir.path.split("/");
    let acc = "";
    for (const part of parts) { acc = acc === "" ? part : `${acc}/${part}`; crumbs.push([part, acc]); }
    $("picker-crumbs").innerHTML = crumbs.map(([label, rel2], i) =>
      `<span data-crumb="${escapeHtml(rel2)}">${i === crumbs.length - 1 ? "▸ " : ""}${escapeHtml(label)}</span>`).join("");
    const rows = [];
    if (dir.parent !== null) rows.push(`<div class="p-row" data-go="..">↩ ..</div>`);
    for (const e of dir.entries) {
      rows.push(e.type === "dir"
        ? `<div class="p-row" data-go="${escapeHtml(e.path)}">📁 ${escapeHtml(e.name)}</div>`
        : `<div class="p-row disabled">· ${escapeHtml(e.name)}</div>`);
    }
    $("picker-list").innerHTML = rows.join("") || `<div class="muted small" style="padding:8px">(empty — create a folder below)</div>`;
    $("picker-selection").textContent = `will create project in: ${pickerPath || "/"}`;
    $("picker-select").disabled = false;
  } catch (e) {
    $("picker-error").textContent = `${e.code ?? "ERROR"}: ${e.message}`;
    $("picker-error").classList.remove("hidden");
  }
}

$("picker-list")?.addEventListener("click", (ev) => {
  const row = ev.target.closest(".p-row");
  if (!row || row.classList.contains("disabled")) return;
  if (row.dataset.go === "..") { void browseTo(pickerPath === "" ? "" : pickerPath.split("/").slice(0, -1).join("/")); return; }
  void browseTo(row.dataset.go);
});

$("picker-crumbs")?.addEventListener("click", (ev) => {
  const c = ev.target.closest("[data-crumb]");
  if (c) void browseTo(c.dataset.crumb);
});

$("picker-mkdir")?.addEventListener("click", async () => {
  const name = $("picker-newname").value.trim();
  if (!name) return;
  try {
    const made = await api("/api/fs/mkdir", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, path: pickerPath }) });
    $("picker-newname").value = "";
    await browseTo(made.path);
  } catch (e) {
    $("picker-error").textContent = `${e.code ?? "ERROR"}: ${e.message}`;
    $("picker-error").classList.remove("hidden");
  }
});

$("picker-select")?.addEventListener("click", () => {
  $("picker-dialog").close();
  if (pickerOnSelect) pickerOnSelect(pickerPath);
});

$("picker-cancel")?.addEventListener("click", () => $("picker-dialog").close());

// ---------------------------------------------------------------------------
// ⌘K command palette + keyboard shortcuts (desktop-app feel)
// ---------------------------------------------------------------------------

const COMMANDS = [
  { key: "⌘K", label: "New chat (configure a workspace)", run: () => void openWizard() },
  { key: "⌘B", label: "Toggle Code / Chat view", run: () => void toggleCode() },
  { key: "⌘J", label: "Toggle the workspace terminal", run: toggleTerminal },
  { key: "⌘⇧F", label: "Browse folders (open a project)", run: () => void openWizard() },
  { key: "⌘S", label: "Save the open editor file", run: () => $("editor-save").click() },
  { key: "⌘W", label: "Stop the selected chat's crew", run: () => $("chat-stop").click() },
];

function renderPalette(filter) {
  const f = (filter ?? "").toLowerCase();
  const items = COMMANDS.filter((c) => c.label.toLowerCase().includes(f));
  $("palette-list").innerHTML = items.map((c, i) =>
    `<li class="${i === 0 ? "active" : ""}" data-cmd="${COMMANDS.indexOf(c)}"><span class="p-key">${c.key}</span>${escapeHtml(c.label)}</li>`).join("")
    || `<li class="muted">no matching command</li>`;
}

function openPalette() { renderPalette(""); $("palette-dialog").showModal(); $("palette-input").value = ""; $("palette-input").focus(); }

$("palette-input")?.addEventListener("input", (ev) => renderPalette(ev.target.value));
$("palette-list")?.addEventListener("click", (ev) => {
  const li = ev.target.closest("[data-cmd]");
  if (li) { $("palette-dialog").close(); COMMANDS[Number(li.dataset.cmd)]?.run(); }
});
$("palette-input")?.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    const first = document.querySelector("#palette-list li[data-cmd]");
    if (first) { $("palette-dialog").close(); COMMANDS[Number(first.dataset.cmd)]?.run(); }
  }
});

document.addEventListener("keydown", (ev) => {
  const meta = ev.metaKey || ev.ctrlKey;
  if (meta && ev.key.toLowerCase() === "k") { ev.preventDefault(); openPalette(); }
  else if (meta && ev.key.toLowerCase() === "b" && state.selected) { ev.preventDefault(); void toggleCode(); }
  else if (meta && ev.key.toLowerCase() === "j") { ev.preventDefault(); toggleTerminal(); }
  else if (meta && ev.key.toLowerCase() === "s" && state.codeOpen) { ev.preventDefault(); $("editor-save").click(); }
});

// ---------------------------------------------------------------------------
// desktop app integration
// ---------------------------------------------------------------------------

// When running inside the Chrome app-mode window (bin/paw-ui), drop the
// browser feel: no text-selection on chrome, tighter fonts already apply.
if (new URLSearchParams(location.search).has("desktop") || window.matchMedia("(display-mode: standalone)").matches) {
  document.body.classList.add("desktop");
}

// "⌘ Desktop app" in the status bar: show the exact relaunch command.
$("sb-desktop")?.addEventListener("click", async () => {
  try {
    const d = await api("/api/desktop");
    $("side-status").textContent = `desktop: run  ${d.launchCommand}`;
    alert(`Open as a desktop app:\n\n  ${d.launchCommand}\n\nThis launches a real app window (no browser chrome, own Dock icon).`);
  } catch (e) {
    alertBar(e);
  }
});

// ---------------------------------------------------------------------------
// REAL terminal (node-pty server-side + xterm.js client-side)
// The workspace's own shell; the harness (claude/dsh/…) runs in it and the
// user watches/interacts live — DeepSeek-Harness-style. No fake output.
// ---------------------------------------------------------------------------

const termState = { session: null }; // { workspaceId, ttyId, term, es, fitSoon }

function termHeader(info) {
  $("term-cwd").textContent = info ? `${info.cwd} · ${info.shell}` : "";
}

async function openTerminal() {
  const agent = state.chats.find((a) => a.id === state.selected);
  if (!agent) { alertBar({ message: "Select a chat first — every terminal belongs to a workspace." }); return; }
  $("term-panel").classList.remove("hidden");
  if (termState.session && termState.session.workspaceId === agent.workspaceId) return;

  teardownTerminal();

  try {
    const existing = await api(`/api/workspaces/${encodeURIComponent(agent.workspaceId)}/terminals`);
    const info = existing.terminals?.[0] ?? await api(`/api/workspaces/${encodeURIComponent(agent.workspaceId)}/terminal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const term = new window.Terminal({
      fontSize: 12,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: "#0a0c0f" },
    });
    term.open($("term-host"));
    term.onData((d) => {
      void api(`/api/terminals/${encodeURIComponent(info.id)}/input`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: d }),
      }).catch(() => undefined);
    });
    term.onResize((size) => {
      void api(`/api/terminals/${encodeURIComponent(info.id)}/resize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cols: size.cols, rows: size.rows }),
      }).catch(() => undefined);
    });
    const es = new EventSource(`/api/terminals/${encodeURIComponent(info.id)}/stream`);
    es.addEventListener("tty", (ev) => term.write(JSON.parse(ev.data)));
    es.addEventListener("error", () => { /* EventSource auto-reconnects */ });
    termState.session = { workspaceId: agent.workspaceId, ttyId: info.id, term, es };
    termHeader(info);
    setTimeout(() => { try { term.focus(); } catch { /* */ } }, 300);
  } catch (e) {
    $("term-cwd").textContent = `terminal unavailable: ${e.message}`;
  }
}

function teardownTerminal() {
  if (!termState.session) return;
  try { termState.session.es.close(); } catch { /* */ }
  try { termState.session.term.dispose(); } catch { /* */ }
  termState.session = null;
  $("term-host").innerHTML = "";
}

function toggleTerminal() {
  const panel = $("term-panel");
  if (panel.classList.contains("hidden")) void openTerminal();
  else { panel.classList.add("hidden"); }
}

$("toggle-term")?.addEventListener("click", toggleTerminal);
$("term-close")?.addEventListener("click", () => {
  if (termState.session) void api(`/api/terminals/${encodeURIComponent(termState.session.ttyId)}/close`, { method: "POST", body: "{}" }).catch(() => undefined);
  teardownTerminal();
  $("term-panel").classList.add("hidden");
});
$("term-clear")?.addEventListener("click", () => termState.session?.term.clear());

// Attaching prefers an EXISTING terminal for the workspace (no shell spam):
// the create endpoint is only hit when the workspace has no live PTY yet.

// ---------------------------------------------------------------------------
// Agent Canvas — every hired agent as a card with a LIVE mini-terminal
// (real PTY streams, DSH control-room style) + shared context footer.
// ---------------------------------------------------------------------------

const canvasSessions = new Map(); // ttyId -> { term, es }

function showView(name) {
  $("view-empty").classList.toggle("hidden", name !== "empty");
  $("view-canvas").classList.toggle("hidden", name !== "canvas");
  $("view-chat").classList.toggle("hidden", name !== "chat");
  if (name === "canvas") void renderCanvas();
}

async function renderCanvas() {
  const grid = $("canvas-grid");
  const agents = state.chats;
  $("canvas-count").textContent = `${agents.length} agent${agents.length === 1 ? "" : "s"} · ${new Set(agents.map((a) => a.root)).size} workspace${new Set(agents.map((a) => a.root)).size === 1 ? "" : "s"}`;

  // Dispose terminals of agents that are gone.
  const live = new Set(agents.map((a) => a.id));
  for (const [ttyId, sess] of canvasSessions) {
    if (!live.has(ttyId.split("-").slice(1, -1).join("-"))) {
      try { sess.es.close(); } catch { /* */ }
      try { sess.term.dispose(); } catch { /* */ }
      canvasSessions.delete(ttyId);
      document.querySelector(`[data-card-tty="${ttyId}"]`)?.remove();
    }
  }

  for (const a of agents) {
    let card = document.querySelector(`[data-card="${a.id}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "canvas-card";
      card.dataset.card = a.id;
      card.innerHTML = `
        <div class="cc-head">
          <span class="status-dot hired"></span>
          <span class="cc-name"></span>
          <span class="cc-sub"></span>
        </div>
        <div class="cc-term mono"></div>
        <div class="cc-foot">
          <button class="btn small cc-open">Open chat</button>
          <span class="muted small cc-meta mono"></span>
        </div>`;
      grid.appendChild(card);
      card.querySelector(".cc-open").addEventListener("click", () => selectChat(a.id));
      card.querySelector(".cc-term").addEventListener("click", () => { selectChat(a.id); void openTerminal(); });
      // Attach the LIVE mini-terminal (real PTY, read+write).
      try {
        const existing = await api(`/api/workspaces/${encodeURIComponent(a.workspaceId)}/terminals`);
        let tty = existing.terminals?.[0];
        if (!tty) {
          tty = await api(`/api/workspaces/${encodeURIComponent(a.workspaceId)}/terminal`, {
            method: "POST", headers: { "content-type": "application/json" }, body: "{}",
          });
        }
        const term = new window.Terminal({ fontSize: 10, scrollback: 200, cursorBlink: false, theme: { background: "#0a0c0f" } });
        term.open(card.querySelector(".cc-term"));
        const es = new EventSource(`/api/terminals/${encodeURIComponent(tty.id)}/stream`);
        es.addEventListener("tty", (ev) => term.write(JSON.parse(ev.data)));
        term.onData((d) => {
          void api(`/api/terminals/${encodeURIComponent(tty.id)}/input`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }),
          }).catch(() => undefined);
        });
        canvasSessions.set(tty.id, { term, es });
        card.querySelector(".cc-term").dataset.cardTty = tty.id;
      } catch (e) {
        card.querySelector(".cc-term").innerHTML = `<span class="muted small">terminal unavailable: ${escapeHtml(e.message)}</span>`;
      }
    }
    // Update status + labels in place (no xterm teardown).
    const dot = card.querySelector(".status-dot");
    dot.className = `status-dot ${a.status}`;
    card.querySelector(".cc-name").textContent = a.id;
    card.querySelector(".cc-sub").textContent = `${a.agentKind} · ${a.sandbox}`;
    card.querySelector(".cc-meta").textContent = a.root;
  }
}

// ---------------------------------------------------------------------------
// Inspector — right panel: agent → workspace → terminal → session log
// ---------------------------------------------------------------------------

let inspectorOpen = false;

async function renderInspector() {
  if (!inspectorOpen || !state.selected) return;
  try {
    const d = await api(`/api/agents/${encodeURIComponent(state.selected)}/inspect`);
    const dl = (pairs) => Object.entries(pairs).map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join("");
    $("inspector-body").innerHTML = `
      <div class="insp-section"><h4>Agent</h4><dl>${dl({
        id: d.agent.id, harness: d.agent.agentKind, status: d.agent.status,
        profile: d.agent.profile.label, sandbox: d.agent.sandbox, hired: d.agent.hiredAt.slice(0, 19),
      })}</dl></div>
      <div class="insp-section"><h4>Workspace</h4><dl>${d.workspace.mounted ? dl({
        id: d.workspace.workspaceId, root: d.workspace.root, sandbox: d.workspace.sandbox, plugins: (d.workspace.pluginIds ?? []).join(", "),
      }) : dl({ state: "not mounted" })}</dl></div>
      <div class="insp-section"><h4>Terminal</h4><dl>${d.terminal.live ? dl({
        id: d.terminal.id, shell: d.terminal.shell, cwd: d.terminal.cwd,
      }) : dl({ state: "not running" })}</dl></div>
      <div class="insp-section"><h4>Context</h4><dl>${dl({ framework: d.contextFramework })}</dl></div>
      <div class="insp-section"><h4>Session log (tail)</h4><pre class="insp-pre">${
        escapeHtml((d.sessionLog ?? []).slice(-8).map((e) => `${String(e.kind ?? "")} ${String(e.timestamp ?? "").slice(11, 19)}`).join("\n") || "(empty)")
      }</pre></div>`;
  } catch (e) {
    $("inspector-body").innerHTML = `<span class="muted">inspect unavailable: ${escapeHtml(e.message)}</span>`;
  }
}

function toggleInspector() {
  inspectorOpen = !inspectorOpen;
  $("inspector").classList.toggle("hidden", !inspectorOpen);
  if (inspectorOpen) void renderInspector();
}

$("nav-canvas")?.addEventListener("click", () => showView(state.chats.length ? "canvas" : "empty"));
$("chat-header")?.insertAdjacentHTML("beforeend", "");
