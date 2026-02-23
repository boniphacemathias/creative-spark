#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8799}"
BASE="http://127.0.0.1:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/creative_spark_backend_smoke.log"
RUN_SUFFIX="$(date +%s)-$RANDOM"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

(
  cd "$(dirname "$0")/.."
  STORAGE_MODE=file PORT="$PORT" node index.js >"$LOG_FILE" 2>&1
) &
SERVER_PID=$!

for _ in $(seq 1 50); do
  if curl -sf "$BASE/health" >/dev/null; then
    break
  fi
  sleep 0.2
done

if ! curl -sf "$BASE/health" >/dev/null; then
  echo "Backend failed to start. Logs: $LOG_FILE"
  cat "$LOG_FILE"
  exit 1
fi

count_array() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log(Array.isArray(j)?j.length:-1);});'
}

alpha_before=$(curl -sf -H 'X-Workspace-Id: alpha' "$BASE/api/campaigns" | count_array)
beta_before=$(curl -sf -H 'X-Workspace-Id: beta' "$BASE/api/campaigns" | count_array)
curl -sf -X POST -H 'Content-Type: application/json' -H 'X-Workspace-Id: alpha' "$BASE/api/campaigns" -d "{\"name\":\"Alpha Smoke Campaign ${RUN_SUFFIX}\"}" >/dev/null
alpha_after=$(curl -sf -H 'X-Workspace-Id: alpha' "$BASE/api/campaigns" | count_array)
beta_after=$(curl -sf -H 'X-Workspace-Id: beta' "$BASE/api/campaigns" | count_array)

drive_alpha_before=$(curl -sf -H 'X-Workspace-Id: alpha' "$BASE/api/drive/folders" | count_array)
drive_beta_before=$(curl -sf -H 'X-Workspace-Id: beta' "$BASE/api/drive/folders" | count_array)
curl -sf -X POST -H 'Content-Type: application/json' -H 'X-Workspace-Id: alpha' "$BASE/api/drive/folders" -d "{\"name\":\"alpha-smoke-folder-${RUN_SUFFIX}\"}" >/dev/null
drive_alpha_after=$(curl -sf -H 'X-Workspace-Id: alpha' "$BASE/api/drive/folders" | count_array)
drive_beta_after=$(curl -sf -H 'X-Workspace-Id: beta' "$BASE/api/drive/folders" | count_array)

chat_alpha_before=$(curl -sf -H 'X-Workspace-Id: alpha' "$BASE/api/chat/messages" | count_array)
chat_beta_before=$(curl -sf -H 'X-Workspace-Id: beta' "$BASE/api/chat/messages" | count_array)
curl -sf -X POST -H 'Content-Type: application/json' -H 'X-Workspace-Id: alpha' "$BASE/api/chat/messages" -d '{"campaignId":null,"message":{"role":"user","content":"hello alpha"}}' >/dev/null
chat_alpha_after=$(curl -sf -H 'X-Workspace-Id: alpha' "$BASE/api/chat/messages" | count_array)
chat_beta_after=$(curl -sf -H 'X-Workspace-Id: beta' "$BASE/api/chat/messages" | count_array)

echo "campaign alpha:${alpha_before}->${alpha_after} beta:${beta_before}->${beta_after}"
echo "drive    alpha:${drive_alpha_before}->${drive_alpha_after} beta:${drive_beta_before}->${drive_beta_after}"
echo "chat     alpha:${chat_alpha_before}->${chat_alpha_after} beta:${chat_beta_before}->${chat_beta_after}"

if [[ "$alpha_after" -le "$alpha_before" || "$beta_after" -ne "$beta_before" ]]; then
  echo "Campaign workspace isolation check failed"
  exit 1
fi

if [[ "$drive_alpha_after" -le "$drive_alpha_before" || "$drive_beta_after" -ne "$drive_beta_before" ]]; then
  echo "Drive workspace isolation check failed"
  exit 1
fi

if [[ "$chat_alpha_after" -le "$chat_alpha_before" || "$chat_beta_after" -ne "$chat_beta_before" ]]; then
  echo "Chat workspace isolation check failed"
  exit 1
fi

echo "Workspace isolation smoke test passed"
