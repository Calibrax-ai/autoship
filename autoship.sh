#!/usr/bin/env bash
# autoship v0.1 — 4-phase ingest orchestrator. Machine state: marker files.
# See docs/architecture/extract-architecture.md.

set -euo pipefail

AUTOSHIP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_PATH="$AUTOSHIP_ROOT/.claude/skills/reverse-spec-extraction/SKILL.md"
VERSION="0.2.0"

PHASES=(boot fanout reconcile critic)

artifacts_for() {
  case "$1" in
    boot)      echo ".autoship/boot-report.json" ;;
    fanout)    echo "artifacts/user-journeys.json artifacts/api-spec.observed.json artifacts/api-spec.declared.json artifacts/data-model.declared.json artifacts/data-model.actual.json artifacts/external-contracts.json artifacts/design.md" ;;
    reconcile) echo "artifacts/api-spec.json artifacts/data-model.json artifacts/prd.md artifacts/reconciliation-report.md" ;;
    critic)    echo "artifacts/critic-report.md" ;;
  esac
}

log()  { printf '[autoship %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die()  { printf '[autoship %s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }
decide_log() { printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$RUN_DIR/decisions.log"; }

# State (marker files)
marker_path()    { echo "$RUN_DIR/state/phase_$1.done"; }
phase_complete() { [[ -f "$(marker_path "$1")" ]]; }
mark_done()      { touch "$(marker_path "$1")"; }

# Verify expected artifacts exist and are non-empty
verify_artifacts() {
  local phase="$1" missing=0
  for rel in $(artifacts_for "$phase"); do
    [[ -s "$PROJECT_DIR/$rel" ]] || { log "  missing: $rel"; missing=$((missing + 1)); }
  done
  [[ $missing -eq 0 ]]
}

# Mark phase done iff artifacts pass; die if not
complete_phase() {
  local phase="$1" note="${2:-}"
  if verify_artifacts "$phase"; then
    mark_done "$phase"
    decide_log "phase=$phase status=complete${note:+ $note}"
  else
    die "$phase phase artifact verification failed"
  fi
}

# Render progress.txt from marker state (one-way, no in-place editing)
render_progress() {
  {
    echo "# autoship / ingest (run $RUN_ID)"
    echo "started: $(cat "$RUN_DIR/started_at" 2>/dev/null || echo unknown)"
    echo
    for p in "${PHASES[@]}"; do
      phase_complete "$p" && echo "- [x] $p" || echo "- [ ] $p"
    done
    echo
    echo "run detail: .autoship/runs/$RUN_ID/"
  } > "$PROGRESS_FILE"
}

# Spawn agent via --agent (system-prompt-level identity, not user-message injection)
spawn_claude() {
  local role="$1"
  local log_file="$RUN_DIR/logs/${role}.log"
  local start exit_code=0
  start="$(date +%s)"
  log "spawn: $role"
  (cd "$AUTOSHIP_ROOT" && env -u CLAUDECODE claude --agent "$role" \
    --add-dir "$PROJECT_DIR" \
    -p "$(run_context)" \
    > "$log_file" 2>&1) || exit_code=$?
  decide_log "role=$role exit=$exit_code duration=$(($(date +%s) - start))s"
  return "$exit_code"
}

run_context() {
  cat <<EOF
Skill: $SKILL_PATH
Prototype: $PROTOTYPE_DIR
Artifacts: $ARTIFACTS_DIR
Boot report: $BOOT_REPORT_PATH
EOF
}

# Phase 0: Boot
detect_runtime() {
  if [[ -f "$PROTOTYPE_DIR/docker-compose.yml" || -f "$PROTOTYPE_DIR/Dockerfile" ]]; then echo docker
  elif [[ -f "$PROTOTYPE_DIR/package.json" ]]; then echo node
  elif [[ -f "$PROTOTYPE_DIR/pyproject.toml" || -f "$PROTOTYPE_DIR/requirements.txt" ]]; then echo python
  else echo unknown
  fi
}

phase_boot() {
  log "phase: boot"
  local runtime; runtime="$(detect_runtime)"
  [[ "$runtime" == "docker" ]] || die "v0.1 supports docker only; got $runtime"

  if grep -qE '^\s*env_file\s*:' "$PROTOTYPE_DIR/docker-compose.yml" 2>/dev/null; then
    [[ -f "$PROTOTYPE_DIR/.env" ]] || die "compose references env_file but $PROTOTYPE_DIR/.env missing"
  fi

  # Fresh containers for new runs; resume keeps existing stack
  if [[ "$IS_NEW_RUN" == true ]]; then
    log "  new run — tearing down stale containers"
    (cd "$PROTOTYPE_DIR" && docker compose down -v 2>/dev/null) || true
  fi

  (cd "$PROTOTYPE_DIR" && docker compose up -d --build --wait --wait-timeout 300) \
    | tee "$RUN_DIR/logs/boot.log"

  # URL discovery with retry — containers without healthchecks may be marked "up"
  # before they bind. Try each port up to 4 times with 1s sleep between rounds.
  local public_url="(undiscovered)"
  for attempt in 1 2 3 4; do
    for port in 80 3000 5000 5050 8000 8080; do
      local code; code="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' "http://localhost:$port/" 2>/dev/null || echo 000)"
      [[ "$code" =~ ^[23] ]] && { public_url="http://localhost:$port/"; break 2; }
    done
    sleep 1
  done

  local env_keys='[]' services='[]'
  [[ -f "$PROTOTYPE_DIR/.env" ]] && env_keys="$(grep -Eo '^[A-Z_][A-Z0-9_]*' "$PROTOTYPE_DIR/.env" 2>/dev/null | jq -R . | jq -sc . 2>/dev/null || echo '[]')"
  services="$(cd "$PROTOTYPE_DIR" && docker compose ps --services 2>/dev/null | jq -R . | jq -sc . 2>/dev/null || echo '[]')"

  cat > "$BOOT_REPORT_PATH" <<EOF
{
  "status": "success",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "runtime_detected": { "runtime": "$runtime", "primary_signal": "docker-compose.yml + Dockerfile" },
  "isolation_tier": "local",
  "public_entry": "$public_url",
  "compose_services": $services,
  "env_file_status": { "state": "user-provided", "path": "prototype/.env", "known_keys": $env_keys },
  "docs_to_ignore": ["prototype/README.md", "prototype/USER_GUIDE.md", "prototype/USER_GUIDE.html", "prototype/USER_GUIDE.pdf"]
}
EOF
  log "  public entry: $public_url"
  complete_phase boot
}

# Phase 1: Fanout
phase_fanout() {
  log "phase: fanout"
  local roles=(ui-walker static data external)
  local pids=()
  for r in "${roles[@]}"; do
    (spawn_claude "$r") &
    pids+=("$!")
  done
  local nonzero=0
  for p in "${pids[@]}"; do wait "$p" || nonzero=$((nonzero + 1)); done
  # Artifacts are source of truth; claude -p can exit nonzero after writing complete outputs
  complete_phase fanout "exit_anomalies=$nonzero"
}

# Phase 2: Reconcile
phase_reconcile() {
  log "phase: reconcile"
  local ec=0
  spawn_claude "reconciler" || ec=$?
  complete_phase reconcile "exit=$ec"
}

# Phase 3: Critic
phase_critic() {
  log "phase: critic"
  local ec=0
  spawn_claude "critic" || ec=$?
  complete_phase critic "exit=$ec"
}

# Commands
cmd_ingest() {
  PROJECT_DIR="$(cd "${1:-$PWD}" && pwd)"
  PROTOTYPE_DIR="$PROJECT_DIR/prototype"
  ARTIFACTS_DIR="$PROJECT_DIR/artifacts"
  AUTOSHIP_DIR="$PROJECT_DIR/.autoship"
  PROGRESS_FILE="$AUTOSHIP_DIR/progress.txt"
  BOOT_REPORT_PATH="$AUTOSHIP_DIR/boot-report.json"
  CURRENT_RUN_FILE="$AUTOSHIP_DIR/current-run"

  [[ -d "$PROTOTYPE_DIR" ]] || die "no prototype/ in $PROJECT_DIR"
  mkdir -p "$ARTIFACTS_DIR" "$AUTOSHIP_DIR/runs"

  if [[ -f "$CURRENT_RUN_FILE" ]] && [[ -d "$AUTOSHIP_DIR/runs/$(cat "$CURRENT_RUN_FILE")" ]]; then
    RUN_ID="$(cat "$CURRENT_RUN_FILE")"
    IS_NEW_RUN=false
    log "resuming: $RUN_ID"
  else
    RUN_ID="$(date -u +%Y-%m-%dT%H-%M-%S)-ingest"
    IS_NEW_RUN=true
    log "new run: $RUN_ID"
  fi

  RUN_DIR="$AUTOSHIP_DIR/runs/$RUN_ID"
  mkdir -p "$RUN_DIR"/{state,logs}
  echo "$RUN_ID" > "$CURRENT_RUN_FILE"
  [[ -f "$RUN_DIR/started_at" ]] || date -u +%Y-%m-%dT%H:%M:%SZ > "$RUN_DIR/started_at"
  touch "$RUN_DIR/decisions.log"

  for phase in "${PHASES[@]}"; do
    if phase_complete "$phase"; then
      log "skip: $phase (done)"
    else
      "phase_$phase"
      render_progress
    fi
  done

  render_progress
  log "DONE. artifacts in $ARTIFACTS_DIR/"
  log "review: cat $ARTIFACTS_DIR/critic-report.md"
}

cmd_status() {
  local f="${1:-$PWD}/.autoship/progress.txt"
  [[ -f "$f" ]] && cat "$f" || echo "no run in ${1:-$PWD}"
}

cmd="${1:-help}"
case "$cmd" in
  ingest)  shift; cmd_ingest "$@" ;;
  status)  shift; cmd_status "$@" ;;
  version) echo "autoship $VERSION" ;;
  help|*) cat <<EOF
autoship $VERSION

usage:
  ./autoship.sh ingest [project-dir]
  ./autoship.sh status [project-dir]
  ./autoship.sh version

project layout:
  project/
    prototype/        input (read-only)
    artifacts/        output — spec pack
    .autoship/
      progress.txt    human status (derived)
      boot-report.json
      current-run
      runs/<id>/
        state/        phase_*.done markers
        logs/  decisions.log  started_at
EOF
    ;;
esac
