# Bash dispatch (Phase 1 of bash CLI v0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `bin/autoship.mjs` controller-dispatch logic with a pure bash entry point. `init` still uses the JS path (deferred to Phase 3). After this phase, audit/groom/deliver/create-issues/materialize/interactive no longer need Node.js to run — they're a 3-line bash dispatch through `claude --agent autoship-controller`.

**Architecture:** Add a new `packages/core/bin/autoship` bash script that becomes the npm-installed entry point. It dispatches non-init verbs to `claude` directly. For `init`, it execs `node bin/autoship.mjs init "$@"` (transitional — Phase 3 replaces this with bash). `package.json` `bin` entry updated to point at the bash script.

**Tech Stack:** bash 4+, standard POSIX utilities, `claude` CLI on PATH at runtime. `shellcheck` for static analysis. `bats` for tests (or plain bash test scripts — pick whichever is already in the repo; bats is not currently a dev dep so plain bash is fine for Phase 1).

---

## Spec coverage (from 2026-05-19-bash-cli-design.md)

This plan is Phase 1 of a multi-phase implementation. Out of scope for THIS plan, deferred to later phases:

- standards-inferrer agent (Phase 2)
- `lib/init.sh` bash init (Phase 3)
- `install.sh` + GitHub Releases (Phase 4)
- npm deprecation notice (Phase 5)

After this phase, npm install still ships, init still uses Node. The win is architectural: dispatch is now Node-free, demonstrating the simplification.

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `packages/core/bin/autoship` | **Create** | bash entry point. ~80 lines. Verb routing + help + AUTOSHIP_PRINT echo + claude-missing fallback. |
| `packages/core/bin/autoship.mjs` | Keep | Still hosts `init` logic until Phase 3. Bash entry execs it for the `init` verb only. |
| `packages/core/package.json` | Modify | Update `bin.autoship` field: `bin/autoship.mjs` → `bin/autoship`. |
| `packages/core/CLAUDE.md` | Modify | Key Files entry for `bin/autoship` (bash entry) + clarification that `bin/autoship.mjs` is transitional. |
| `packages/core/test/bash-dispatch.sh` | **Create** | Smoke test asserting AUTOSHIP_PRINT output matches expected `claude` invocations for each verb. |

---

## Task 1: Add the bash entry point

**Files:**
- Create: `packages/core/bin/autoship`

- [ ] **Step 1: Create the bash script**

```bash
#!/usr/bin/env bash
# autoship — turn messy software work into reviewable, reliable delivery
# Phase 1 bash dispatch. Non-init verbs go through claude directly; init
# transitionally delegates to bin/autoship.mjs (replaced in Phase 3).

set -euo pipefail

VERB="${1:-help}"
shift || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_help() {
  cat <<'USAGE'
autoship — turn messy software work into reviewable, reliable delivery

Usage:
  autoship init                        Install + configure autoship in this repo
  autoship init --no-interactive       (kept for backwards compat — already non-interactive)
  autoship "<prompt>"                  Run a natural-language request through the controller
  autoship audit [args...]             Run audit via the controller (interactive — output streams)
  autoship groom [scope...]            Groom issues and write local specs
  autoship deliver [args...]           Run deliver via the controller (interactive — output streams)
  autoship create-issues <issue-id>    Create Linear child issues from an approved breakdown
  autoship materialize <issue-id>      Compatibility alias for create-issues
  autoship interactive                 Open an interactive controller chat with no starting prompt

Prompt/audit/groom/deliver default to INTERACTIVE mode — output streams as the
controller runs, session stays open for follow-ups. Add --print for headless
mode (final response only; useful for CI / pipes).

Set AUTOSHIP_PRINT=1 to see the resolved `claude` invocation without running it.

Docs: https://github.com/Calibrax-ai/autoship
USAGE
}

# Build the controller prompt: "<verb> [args...]"
build_prompt() {
  local verb="$1"; shift
  if [[ $# -eq 0 ]]; then
    printf '%s' "$verb"
  else
    printf '%s %s' "$verb" "$*"
  fi
}

# Detect --print in the remaining args; strip it; return remaining args via stdout.
# Sets PRINT_FLAG=1 if --print is present.
PRINT_FLAG=0
strip_print_flag() {
  local out=()
  PRINT_FLAG=0
  for arg in "$@"; do
    if [[ "$arg" == "--print" ]]; then
      PRINT_FLAG=1
    else
      out+=("$arg")
    fi
  done
  printf '%s\n' "${out[@]}"
}

# Dispatch a verb prompt to claude --agent autoship-controller.
# mode: interactive (default) or headless (via --print)
dispatch_controller() {
  local prompt="$1"
  local mode="${2:-interactive}"

  local claude_path
  claude_path="$(command -v claude || true)"

  # AUTOSHIP_PRINT=1: echo the resolved invocation instead of running.
  if [[ "${AUTOSHIP_PRINT:-}" == "1" ]]; then
    local display_path="${claude_path:-claude}"
    if [[ "$mode" == "headless" ]]; then
      printf '%s --agent autoship-controller -p "%s"\n' "$display_path" "$prompt"
    else
      if [[ -n "$prompt" ]]; then
        printf '%s --agent autoship-controller "%s"\n' "$display_path" "$prompt"
      else
        printf '%s --agent autoship-controller\n' "$display_path"
      fi
    fi
    return 0
  fi

  # No claude on PATH: print guidance and exit non-zero.
  if [[ -z "$claude_path" ]]; then
    cat >&2 <<EOF

\`claude\` is not on your PATH, so autoship can't run the controller for you.

Install Claude Code (https://claude.com/claude-code), then run:

  claude --agent autoship-controller -p "$prompt"

(Set AUTOSHIP_PRINT=1 to print this command without trying to run it.)
EOF
    exit 1
  fi

  if [[ "$mode" == "headless" ]]; then
    exec "$claude_path" --agent autoship-controller -p "$prompt"
  else
    if [[ -n "$prompt" ]]; then
      exec "$claude_path" --agent autoship-controller "$prompt"
    else
      exec "$claude_path" --agent autoship-controller
    fi
  fi
}

# Dispatch helper for verbs that build a "<verb> [args...]" prompt.
verb_dispatch() {
  local verb="$1"; shift
  local args=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && args+=("$line")
  done < <(strip_print_flag "$@")
  local prompt
  prompt="$(build_prompt "$verb" "${args[@]}")"
  if [[ "$PRINT_FLAG" == "1" ]]; then
    dispatch_controller "$prompt" headless
  else
    dispatch_controller "$prompt" interactive
  fi
}

case "$VERB" in
  init)
    # Transitional: Phase 3 replaces this with lib/init.sh.
    exec node "$SCRIPT_DIR/autoship.mjs" init "$@"
    ;;
  audit|groom|deliver|create-issues|materialize)
    verb_dispatch "$VERB" "$@"
    ;;
  interactive)
    dispatch_controller "" interactive
    ;;
  help|--help|-h)
    print_help
    ;;
  --version)
    node -e "console.log(require('$SCRIPT_DIR/../package.json').version)"
    ;;
  *)
    # Bare prompt forwarding: anything that wasn't a known verb is a natural-language prompt.
    if [[ -n "$VERB" ]]; then
      local_args=("$VERB" "$@")
      args=()
      while IFS= read -r line; do
        [[ -n "$line" ]] && args+=("$line")
      done < <(strip_print_flag "${local_args[@]}")
      prompt="${args[*]}"
      if [[ "$PRINT_FLAG" == "1" ]]; then
        dispatch_controller "$prompt" headless
      else
        dispatch_controller "$prompt" interactive
      fi
    else
      print_help
    fi
    ;;
esac
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x packages/core/bin/autoship
```

- [ ] **Step 3: Static check with shellcheck**

```bash
shellcheck packages/core/bin/autoship
```

Expected: no errors. Info-level warnings about `local_args` outside a function (the catch-all `*)` case) are acceptable — that block is inside a `case` statement which doesn't establish function scope. If shellcheck flags it as an error, refactor by moving the bare-prompt logic into a function.

- [ ] **Step 4: Manual smoke — help works**

```bash
AUTOSHIP_PRINT=1 packages/core/bin/autoship --help | head -5
```

Expected: first line of help text printed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/bin/autoship
git commit -m "feat(cli): add bash entry point for autoship (Phase 1 dispatch)

Adds packages/core/bin/autoship as a bash script that handles the
controller-dispatch verbs (audit, groom, deliver, create-issues,
materialize, interactive) and bare-prompt forwarding. init still
delegates to bin/autoship.mjs until Phase 3.

Removes Node.js from the runtime path for non-init verbs.

Per packages/core/docs/plans/2026-05-19-bash-cli-design.md Phase 1."
```

---

## Task 2: Write a smoke test asserting bash and .mjs produce identical dispatch commands

**Files:**
- Create: `packages/core/test/bash-dispatch.sh`

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bash
# Smoke test: bash entry point's AUTOSHIP_PRINT output must match the
# existing bin/autoship.mjs's AUTOSHIP_PRINT output for all dispatch verbs.

set -euo pipefail

cd "$(dirname "$0")/.."  # packages/core

BASH="./bin/autoship"
MJS="node ./bin/autoship.mjs"

fail=0
check() {
  local label="$1"; shift
  local bash_out mjs_out
  bash_out="$(AUTOSHIP_PRINT=1 $BASH "$@")"
  mjs_out="$(AUTOSHIP_PRINT=1 $MJS "$@")"
  if [[ "$bash_out" != "$mjs_out" ]]; then
    echo "FAIL: $label" >&2
    echo "  bash: $bash_out" >&2
    echo "   mjs: $mjs_out" >&2
    fail=1
  else
    echo "ok: $label"
  fi
}

check "audit --report-only" audit --report-only
check "groom FRD-162" groom FRD-162
check "groom FRD-162 --post" groom FRD-162 --post
check "deliver FRD-162" deliver FRD-162
check "deliver FRD-162 --dry-run" deliver FRD-162 --dry-run
check "create-issues FRD-161" create-issues FRD-161
check "materialize FRD-161" materialize FRD-161
check "audit --report-only --print" audit --report-only --print
check "bare prompt" "get all Todo issues"
check "interactive" interactive

if [[ $fail -ne 0 ]]; then
  echo "Some dispatches drifted between bash and .mjs"
  exit 1
fi
echo "All dispatch verbs produce identical commands."
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x packages/core/test/bash-dispatch.sh
```

- [ ] **Step 3: Run the test**

```bash
packages/core/test/bash-dispatch.sh
```

Expected: every `check` prints `ok: ...`, final line "All dispatch verbs produce identical commands." Exit 0.

If a check fails: it means the bash output differs from .mjs output. Fix the bash script to match exactly. The .mjs is the ground truth for Phase 1 (existing behavior).

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/bash-dispatch.sh
git commit -m "test(cli): assert bash and .mjs produce identical dispatch commands

Smoke test runs both bin/autoship and bin/autoship.mjs with AUTOSHIP_PRINT=1
for each verb. Output must be byte-identical. Catches dispatch drift
during the bash transition."
```

---

## Task 3: Update package.json bin entry

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: Read current bin section**

```bash
grep -A2 '"bin"' packages/core/package.json
```

Expected: `"bin": { "autoship": "bin/autoship.mjs" }` (or similar).

- [ ] **Step 2: Update bin to point at bash entry**

Change `"autoship": "bin/autoship.mjs"` → `"autoship": "bin/autoship"`.

- [ ] **Step 3: Verify npm pack picks up the bash file**

```bash
cd packages/core && npm pack --dry-run --json | python3 -c "import json,sys; d=json.load(sys.stdin); print([f['path'] for f in d[0]['files'] if 'bin/' in f['path']])"
```

Expected: list includes both `bin/autoship` and `bin/autoship.mjs`. (The `files:` field in package.json declares `bin/` which is the directory — both files travel.)

- [ ] **Step 4: Verify file count hasn't regressed**

```bash
cd packages/core && npm pack --dry-run --json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Files: {len(d[0][\"files\"])}')"
```

Expected: 56 files (was 55; added bin/autoship).

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json
git commit -m "chore(cli): point npm bin at the bash entry point

Existing npm consumers (already-installed @cs-calibrax/autoship users)
get the bash dispatcher on next install. init still works because the
bash script execs bin/autoship.mjs for that verb (transitional)."
```

---

## Task 4: Smoke test in a clean workspace (no Node-runtime path)

**Files:**
- None to create. Manual verification.

- [ ] **Step 1: Run the new bash entry directly (no npm)**

```bash
cd /tmp
rm -rf bash-smoke && mkdir bash-smoke && cd bash-smoke
git init
AUTOSHIP_PRINT=1 /Users/shyangcalibrax/Documents/Projects/autoship-project/autoship/packages/core/bin/autoship audit --report-only
```

Expected: `claude --agent autoship-controller "audit --report-only"` printed.

- [ ] **Step 2: Verify init still works via the delegated Node path**

```bash
/Users/shyangcalibrax/Documents/Projects/autoship-project/autoship/packages/core/bin/autoship init
```

Expected: init runs (creates `.claude/`, `.autoship/`, etc.). The bash script execs into Node for this verb, so Node IS required for init still (Phase 3 fixes that).

- [ ] **Step 3: Verify --help works without claude installed**

The previous bin/autoship.mjs printed help even without `claude` on PATH. The bash version should too. Test:

```bash
PATH=/usr/bin:/bin /Users/shyangcalibrax/Documents/Projects/autoship-project/autoship/packages/core/bin/autoship --help | head -5
```

Expected: help printed.

- [ ] **Step 4: Verify claude-missing fallback for dispatch verbs**

```bash
PATH=/usr/bin:/bin /Users/shyangcalibrax/Documents/Projects/autoship-project/autoship/packages/core/bin/autoship audit --report-only
```

Expected: stderr message "claude is not on your PATH..." with the resolved command shown. Exit code 1.

(Use `echo $?` after to confirm exit code.)

---

## Task 5: Update CLAUDE.md and commit

**Files:**
- Modify: `packages/core/CLAUDE.md`

- [ ] **Step 1: Replace the Key Files entry for bin/autoship.mjs**

Find this line in `packages/core/CLAUDE.md`:

```
- `bin/autoship.mjs` — native CLI: `init`, `audit`, `groom`, `deliver`, `create-issues`, `materialize`, bare-prompt forwarding, and `interactive`. All non-init commands spawn `claude --agent autoship-controller` with the right prompt.
```

Replace with:

```
- `bin/autoship` — bash CLI entry point. Handles audit/groom/deliver/create-issues/materialize/interactive verbs and bare-prompt forwarding via a 3-line `claude --agent autoship-controller` dispatch. Pure bash; no Node runtime needed for non-init verbs. Delegates `init` to `bin/autoship.mjs` (transitional — Phase 3 of v0.7.0 replaces init with bash too).
- `bin/autoship.mjs` — transitional: still owns the `init` verb. Will be replaced in Phase 3 of the bash CLI migration.
```

- [ ] **Step 2: Update the Common Commands section if it references autoship.mjs**

```bash
grep -n "autoship.mjs" packages/core/CLAUDE.md
```

If any matches reference the `init` verb (e.g., `node /Users/.../bin/autoship.mjs init`), leave them alone — init still uses the .mjs. If any reference non-init verbs via `node bin/autoship.mjs <verb>`, update them to `bin/autoship <verb>`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/CLAUDE.md
git commit -m "docs(cli): note bash entry replaces the .mjs dispatcher

Phase 1 of the bash CLI migration. init still uses .mjs (Phase 3 fix).
All other verbs are now bash + claude --agent."
```

---

## Self-review (run mentally after writing — do NOT skip)

**Spec coverage:**

- [x] Replaces dispatcher logic with bash → Task 1 ✓
- [x] init still works transitionally → Task 1 (exec node ... init "$@") ✓
- [x] npm bin entry updated → Task 3 ✓
- [x] Tests confirm parity with .mjs → Task 2 ✓
- [x] Docs updated → Task 5 ✓
- [x] Manual smoke verified in clean dir → Task 4 ✓
- [ ] standards-inferrer agent → NOT in scope (Phase 2)
- [ ] install.sh → NOT in scope (Phase 4)
- [ ] npm deprecation → NOT in scope (Phase 5)

**Placeholder scan:** No "TBD", "TODO", "implement later" in any task. Every step has executable code or commands. ✓

**Type consistency:** Variables in the bash script (`PRINT_FLAG`, `SCRIPT_DIR`, `VERB`, `claude_path`) are used consistently across functions. Test script's `check` function takes `label` followed by arguments — consistent across all 10 invocations. ✓

---

## Execution

After this plan lands as a PR and merges, Phase 2 (standards-inferrer agent) is the next plan to write. Until Phase 4 ships install.sh, npm install is still the only distribution path. The "no npm install" promise lands at end of Phase 4.

**This phase's measurable progress against the session goal:** non-init verbs no longer require Node.js to run. init still does. ~25% of the way to "no npm install."
