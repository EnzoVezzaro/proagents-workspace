#!/bin/bash
# Live verification of the chat-isolation model (§147) — ONE process session
# so background reaping between tool calls cannot kill the server.
set -u
PORT=4693
BASE=$(mktemp -d /tmp/paw-live-XXXX)
export PAW_UI_PORT=$PORT PAW_UI_BASE_DIR=$BASE PAW_PLUGINS=filesystem,shell
cd "$(dirname "$0")/.."
node app/dist/server.js > "$BASE/server.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; wait $SRV 2>/dev/null' EXIT

for i in $(seq 1 40); do
  curl -s -m 2 "http://127.0.0.1:$PORT/api/health" -o /dev/null && break
  sleep 0.5
done
echo "server up (base=$BASE)"

fail=0
note() { printf '%s\n' "$*"; }
check() { if [ "$1" = "0" ]; then note "  ✓ $2"; else note "  ✗ $2"; fail=1; fi; }

# A source repo with content, to be materialized per chat as a worktree.
SRC="$BASE/src-project"
mkdir -p "$SRC"
git -C "$SRC" init -q
git -C "$SRC" config user.email t@t; git -C "$SRC" config user.name t
echo "v1" > "$SRC/lib.txt"; git -C "$SRC" add .; git -C "$SRC" commit -qm init

note "1) empty-workspace chat"
E=$(curl -s -m 90 -X POST "http://127.0.0.1:$PORT/api/wizard/launch" -H 'content-type: application/json' \
  -d '{"name":"alpha","crew":[{"profileId":"generalist","agentKind":"claude"}],"sandbox":"workspace-write"}')
EA=$(echo "$E" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["crew"][0]["agentId"])')
EROOT=$(echo "$E" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["workspace"]["root"])')
echo "$E" | python3 -c 'import json,sys; d=json.load(sys.stdin); m=d["materialization"]; ws=d["workspace"]; assert m["kind"]=="none" and ws["fresh"] is True and ws["root"].startswith("chats/") and ws["workspaceId"]==d["crew"][0]["agentId"]' ; check $? "empty chat: fresh chats/ workspace, materialization=none, agentId==workspaceId"
test -d "$BASE/$EROOT" ; check $? "empty chat dir exists at $EROOT"

note "2) local git repo → per-chat worktree"
W=$(curl -s -m 90 -X POST "http://127.0.0.1:$PORT/api/wizard/launch" -H 'content-type: application/json' \
  -d "{\"name\":\"wtchat\",\"crew\":[{\"profileId\":\"generalist\",\"agentKind\":\"claude\"}],\"project\":{\"localPath\":\"src-project\"}}")
WA=$(echo "$W" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["crew"][0]["agentId"])')
WROOT=$(echo "$W" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["workspace"]["root"])')
echo "$W" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["materialization"]["kind"]=="worktree"' ; check $? "materialization=worktree for a local git repo"
test -f "$BASE/$WROOT/lib.txt" ; check $? "worktree chat received project content (lib.txt)"
test -f "$BASE/$WROOT/.git" && ! test -d "$BASE/$WROOT/.git" ; check $? "worktree .git is a FILE (linked, not a clone)"
B=$(git -C "$SRC" branch --list 'chat-*' | wc -l | tr -d ' '); [ "$B" -ge 1 ] ; check $? "source repo gained a per-chat branch (chat-*)"
git -C "$SRC" status --porcelain | grep -q . ; [ $? -ne 0 ] ; check $? "source repo untouched (clean status)"

note "3) second chat via project.id → its own worktree, no mixing"
# Register the source once, then reference it BY ID (catalog semantics).
R=$(curl -s -m 30 -X POST "http://127.0.0.1:$PORT/api/projects/local" -H 'content-type: application/json' -d '{"path":"src-project","name":"src-project-2"}')
PID=$(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["id"])')
W2=$(curl -s -m 90 -X POST "http://127.0.0.1:$PORT/api/wizard/launch" -H 'content-type: application/json' \
  -d "{\"name\":\"wtchat-b\",\"crew\":[{\"profileId\":\"generalist\",\"agentKind\":\"claude\"}],\"project\":{\"id\":\"$PID\"}}")
WA2=$(echo "$W2" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["crew"][0]["agentId"])')
WROOT2=$(echo "$W2" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["workspace"]["root"])')
echo "$W2" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["materialization"]["kind"]=="worktree"' ; check $? "second chat materialization=worktree via project.id"
[ "$WA" != "$WA2" ] && [ "$WROOT" != "$WROOT2" ] ; check $? "two chats → two distinct workspaces ($WROOT vs $WROOT2)"
echo "chat-two" > "$BASE/$WROOT2/two.txt"
test ! -e "$BASE/$WROOT/two.txt" ; check $? "chat 2's new file did NOT leak into chat 1"

note "4) settle parks, nothing destroyed"
SETR=$(curl -s -m 30 -X POST "http://127.0.0.1:$PORT/api/chats/$EA/settle")
echo "$SETR" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('settled')=='$EA'" ; check $? "settle endpoint returns the settled chat id"
S=$(curl -s -m 10 "http://127.0.0.1:$PORT/api/agents")
echo "$S" | python3 -c "import json,sys; d=json.load(sys.stdin); a=[x for x in d['agents'] if x['id']=='$EA']; assert a and a[0]['status']=='settled'" ; check $? "roster reports the chat as settled"
test -d "$BASE/$EROOT" ; check $? "settled chat workspace still on disk"

note "5) purge guard + forced purge"
P=$(curl -s -m 60 -X POST "http://127.0.0.1:$PORT/api/chats/$WA2/purge" -H 'content-type: application/json' -d '{}')
echo "$P" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["error"]["code"]=="WORKSPACE_INVALID_STATE" and "uncommitted" in d["error"]["message"]' ; check $? "dirty chat purge refused (uncommitted work)"
PF=$(curl -s -m 60 -X POST "http://127.0.0.1:$PORT/api/chats/$WA2/purge" -H 'content-type: application/json' -d '{"force":true}')
echo "$PF" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('purged')=='$WA2' and d['destroyedWork']" ; check $? "forced purge reports destroyed work honestly"
test ! -e "$BASE/$WROOT2" ; check $? "purged chat directory is gone"
git -C "$SRC" worktree list --porcelain | grep -q "$WROOT2" ; [ $? -ne 0 ] ; check $? "source repo worktree metadata cleaned (no stale entry)"
PC=$(curl -s -m 60 -X POST "http://127.0.0.1:$PORT/api/chats/$EA/purge" -H 'content-type: application/json' -d '{}')
echo "$PC" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('purged')=='$EA'" ; check $? "clean settled chat purges directly"

note "6) GitHub per-chat clone (public repo)"
G=$(curl -s -m 240 -X POST "http://127.0.0.1:$PORT/api/wizard/launch" -H 'content-type: application/json' \
  -d '{"name":"gh","crew":[{"profileId":"generalist","agentKind":"claude"}],"project":{"github":{"repo":"expressjs/express"}}}')
GA=$(echo "$G" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["crew"][0]["agentId"])')
GROOT=$(echo "$G" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["workspace"]["root"])')
echo "$G" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["materialization"]["kind"]=="clone" and d["provisioning"]["ok"]' ; check $? "github chat: materialization=clone, provisioning ok"
test -f "$BASE/$GROOT/package.json" ; check $? "repo cloned INTO the chat workspace (package.json present)"
test -d "$BASE/repos" ; [ $? -ne 0 ] ; check $? "no shared repos/ dir exists anymore"

echo
if [ "$fail" = "0" ]; then echo "ALL ISOLATION CHECKS PASSED"; else echo "FAILURES DETECTED (base=$BASE, server log: $BASE/server.log)"; fi
exit $fail
