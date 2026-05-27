#!/usr/bin/env bash
# Smoke test: bash entry point's AUTOSHIP_PRINT output must match the
# existing bin/autoship.mjs's AUTOSHIP_PRINT output for all dispatch verbs.
# Catches dispatch drift during the bash transition.

set -euo pipefail

cd "$(dirname "$0")/.."  # → packages/core

BASH_CLI="./bin/autoship"
MJS_CLI=(node "./bin/autoship.mjs")

fail=0
ran=0

check() {
  local label="$1"; shift
  local bash_out mjs_out
  ran=$((ran + 1))
  bash_out="$(AUTOSHIP_PRINT=1 "$BASH_CLI" "$@")"
  mjs_out="$(AUTOSHIP_PRINT=1 "${MJS_CLI[@]}" "$@")"
  if [[ "$bash_out" != "$mjs_out" ]]; then
    echo "FAIL: $label" >&2
    echo "  bash: $bash_out" >&2
    echo "   mjs: $mjs_out" >&2
    fail=1
  else
    echo "ok: $label"
  fi
}

# Dispatch verbs
check "audit --report-only"            audit --report-only
check "audit (no args)"                audit
check "groom FRD-162"                  groom FRD-162
check "groom FRD-162 --post"           groom FRD-162 --post
check "groom mine --state Todo"        groom mine --state Todo
check "deliver FRD-162"                deliver FRD-162
check "deliver FRD-162 --dry-run"      deliver FRD-162 --dry-run
check "deliver build FRD-162"          deliver build FRD-162
check "create-issues FRD-161"          create-issues FRD-161
check "materialize FRD-161"            materialize FRD-161
check "interactive"                    interactive

# --print headless mode for each variant
check "audit --print"                  audit --report-only --print
check "deliver --print"                deliver FRD-162 --print

# Bare prompt forwarding
check "bare prompt single arg"         "get all Todo issues"
check "bare prompt multiple args"      get all Todo issues

if [[ $fail -ne 0 ]]; then
  echo "" >&2
  echo "FAIL: bash and .mjs dispatch drifted on one or more verbs above." >&2
  exit 1
fi

echo ""
echo "PASS: all $ran dispatches produce identical commands."
