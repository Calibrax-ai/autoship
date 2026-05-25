---
title: "bash CLI design (autoship 0.7.0)"
---

**Status:** Design · **Last updated:** 2026-05-19

> **Scope.** This document proposes replacing autoship's current npm/Node CLI with a pure shell-script CLI plus a new `standards-inferrer` agent. The move is not a packaging swap — it's an architectural simplification that pushes the only complex CLI logic (standards inference) into an agent, where autoship's doctrine says it belonged from day one. Nothing here ships until the design is reviewed and a writing-plans plan is produced.

## In plain English

Autoship's CLI today is ~700 lines of JavaScript doing four things: copy files, render YAML templates, infer standards from repo evidence, and spawn `claude --agent autoship-controller`. Three of those four jobs are 30-line bash one-liners. The fourth — standards inference (~300 lines of regex + JSON walking across `package.json`, `Makefile`, `pyproject.toml`, `.env.example`, CI configs) — is the only thing forcing autoship to ship a Node.js runtime.

Autoship's doctrine says: *agents do the work, the controller orchestrates, mechanical checks belong in the controller.* Standards inference is **work**: read evidence, apply judgment, emit structured output. It's an agent-shaped job that ended up in the CLI for historical reasons (the CLI shipped before the agent infrastructure was mature).

This design pushes inference into a new `standards-inferrer` agent. The CLI then collapses to a 200-300 line bash script: file copying, template substitution, process spawning. Distribution becomes a single executable file behind `curl | sh`. Zero runtime dependencies beyond bash + standard Unix tools.

## What v0.7.0 ships and what it explicitly does not

**v0.7.0 ships:**

- New agent: `standards-inferrer` (read-only, returns YAML content for `.autoship/standards.yaml`)
- New CLI: `bin/autoship` as a bash script (replaces `bin/autoship.mjs`)
- Templates as `.template.yaml` files in `templates/` (replaces JS template-renderer functions)
- New `install.sh` for curl-install distribution
- GitHub Releases tarball as the canonical distribution channel
- npm package marked deprecated (but kept published for one transition release)

**v0.7.0 explicitly does not ship:**

- A Windows-native version (Windows operators continue using WSL or git-bash)
- Multi-model standards-inferrer variants (the agent is Claude-tuned; multi-model is future)
- A `autoship upgrade` self-update verb (re-running `install.sh` is the update path)
- Any change to `autoship audit | groom | deliver | create-issues` semantics — these still dispatch via `claude --agent autoship-controller`

## Architecture

```
autoship/
├── bin/
│   └── autoship                       # bash entry point, ~50 lines
├── lib/
│   ├── init.sh                        # init verb (scaffolds .autoship/, copies agents/skills)
│   ├── dispatch.sh                    # audit/groom/deliver/create-issues — thin claude --agent shim
│   ├── upgrade-framework.sh           # --upgrade-framework path
│   └── advisory.sh                    # re-run-on-existing .autoship/ advisory mode
├── templates/
│   ├── standards.template.yaml        # SET_ME-laden template (consumed by standards-inferrer)
│   ├── defaults.template.yaml         # all-commented template (copied verbatim)
│   ├── runners.template.yaml          # claude-code default (copied verbatim)
│   └── gitignore.fragment             # appended to .gitignore
├── .claude/
│   ├── agents/                        # existing 10 + new standards-inferrer = 11
│   └── skills/                        # existing 8 skills, unchanged
├── docs/architecture/                 # operator-installed architecture docs
├── install.sh                         # curl install script
└── README.md
```

## standards-inferrer agent

**Frontmatter:**

```yaml
---
name: standards-inferrer
description: Reads a target repo's evidence (package.json, Makefile, pyproject.toml, .env.example, CI configs) and emits a filled .autoship/standards.yaml. Fields backed by evidence get a `# inferred from <evidence>` trailing comment. Unknown fields stay SET_ME. Read-only; never writes to operator files directly — emits content to stdout.
model: "haiku[1m]"
effort: medium
tools: Read, Glob, Grep, Bash
maxTurns: 20
permissionMode: bypassPermissions
---
```

**Posture:**

- Evidence-first. No invention. If you can't trace a value to a file:line, leave it SET_ME.
- Conservative. When two pieces of evidence disagree, mark SET_ME and note the conflict in a `# conflict: ...` comment.
- Stdout-only output. Never write files.

**Inputs (pre-injected by CLI):**

- `template_path`: absolute path to `standards.template.yaml`
- `repo_path`: absolute path to the target repo
- `output_format`: `stdout` (always; the CLI redirects to `.autoship/standards.yaml`)

**Procedure:**

1. Read the template at `template_path`. It's an autoship-doctrine SET_ME-laden YAML skeleton.
2. Walk evidence sources in this order: `package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml`, `.env.example`, `.github/workflows/*.yml`, `Dockerfile`, `docker-compose.yml`.
3. For each field in the template, attempt one inference per evidence source. First confident hit wins. Append a trailing `# inferred from <relative-path>` comment.
4. For ambiguous fields (multi-source conflict, or no clear match), leave SET_ME and append `# conflict: <one-line description>` when conflict was observed.
5. Emit the filled YAML to stdout. Print nothing else (no prose, no logs, no chatter — the CLI captures stdout directly).

**Why Haiku and not Opus:** inference is mechanical pattern-matching, not judgment-heavy. Haiku is fast, cheap, and sufficient. Reserve Opus for the controller and reviewers.

## CLI: bin/autoship

```bash
#!/usr/bin/env bash
set -euo pipefail

AUTOSHIP_ROOT="${AUTOSHIP_ROOT:-$HOME/.autoship}"
VERB="${1:-help}"
shift || true

case "$VERB" in
  init)
    source "$AUTOSHIP_ROOT/lib/init.sh"
    init "$@"
    ;;
  audit|groom|deliver|create-issues|materialize|interactive)
    source "$AUTOSHIP_ROOT/lib/dispatch.sh"
    dispatch "$VERB" "$@"
    ;;
  --version) cat "$AUTOSHIP_ROOT/VERSION" ;;
  --help|help) cat "$AUTOSHIP_ROOT/USAGE.txt" ;;
  *) echo "Unknown verb: $VERB" >&2; exit 1 ;;
esac
```

That's the whole entry point. ~50 lines including help and error handling.

## init flow (bash)

```bash
init() {
  local cwd="$PWD"

  [[ -d "$cwd/.autoship" ]] && { advisory_mode "$cwd"; return 0; }
  [[ ! -d "$cwd/.git" ]] && echo "Warning: not a git repo. autoship expects one." >&2

  echo "Installing autoship..."

  mkdir -p "$cwd/.claude/agents" "$cwd/.claude/skills" "$cwd/docs/architecture" "$cwd/.autoship"

  cp "$AUTOSHIP_ROOT"/.claude/agents/*.md "$cwd/.claude/agents/"
  cp -r "$AUTOSHIP_ROOT"/.claude/skills/* "$cwd/.claude/skills/"
  cp -r "$AUTOSHIP_ROOT"/docs/architecture/* "$cwd/docs/architecture/"
  echo "  ✓ core agents, skills, architecture docs scaffolded"

  # Inference via agent. Stdout → standards.yaml.
  claude --agent standards-inferrer --verbose -p "$(cat <<EOF
Repo: $cwd
Template: $AUTOSHIP_ROOT/templates/standards.template.yaml
Emit the filled standards.yaml to stdout. See your agent definition for the procedure.
EOF
)" > "$cwd/.autoship/standards.yaml"
  echo "  ✓ standards.yaml inferred"

  cp "$AUTOSHIP_ROOT/templates/defaults.template.yaml" "$cwd/.autoship/defaults.yaml"
  cp "$AUTOSHIP_ROOT/templates/runners.template.yaml" "$cwd/.autoship/runners.yaml"
  echo "  ✓ defaults.yaml + runners.yaml templates copied"

  update_gitignore "$cwd"
  print_next_steps
}
```

## Dispatch flow (audit/groom/deliver/create-issues)

```bash
dispatch() {
  local verb="$1"; shift
  exec claude --agent autoship-controller --verbose -p "$verb $*"
}
```

Three lines. The controller already handles all routing logic — the CLI is pure pass-through.

## Distribution: install.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="${AUTOSHIP_VERSION:-latest}"
INSTALL_DIR="${AUTOSHIP_ROOT:-$HOME/.autoship}"
BIN_LINK="${AUTOSHIP_BIN:-/usr/local/bin/autoship}"

# Fetch tarball from GitHub Releases
URL="https://github.com/Calibrax-ai/autoship/releases/${VERSION}/download/autoship.tar.gz"
mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" | tar -xz -C "$INSTALL_DIR"

# Symlink bin
ln -sf "$INSTALL_DIR/bin/autoship" "$BIN_LINK"

echo "autoship installed → $BIN_LINK"
echo "Run: autoship init"
```

Operator install becomes: `curl -fsSL https://autoship.dev/install.sh | sh`.

Updates: re-run the same line. Versioning: `autoship --version` reads from `$AUTOSHIP_ROOT/VERSION` (shipped in the tarball).

## Migration

**Existing npm operators:** their `@cs-calibrax/autoship` install continues working. v0.7.0 ships as a parallel distribution. v0.7.0's npm publish carries a `postinstall` notice pointing to the new curl install. v0.8.0 deprecates npm entirely.

**Existing repos with `.autoship/`:** re-running `autoship init` from the new bash CLI hits advisory mode (existing behavior). Operator files are never touched. The only operator-visible difference is that the standards.yaml inference comes from a different process (agent vs JS regex), but the output shape is identical.

**Operators who never installed autoship:** they get the curl install, period. npm goes away from their mental model.

## Risks and open questions

1. **`claude --agent standards-inferrer` cost.** Adds one model call to every fresh `autoship init`. Haiku is cheap (~$0.001 per call); over thousands of installs the bill is rounding error. But the latency (1-3 sec) is operator-visible vs. the current ~50ms JS regex. Acceptable trade for the architecture simplification.

2. **No-claude fallback.** If `claude` CLI is not installed when an operator runs `autoship init`, inference fails. Today's JS works offline. Mitigation: detect missing `claude` upfront, fall back to "all SET_ME" template, print a notice telling the operator to run `claude` then re-run `autoship init` for the advisory.

3. **`jq` and other tool deps in the standards-inferrer's `Bash` tool calls.** The agent might want `jq` for `package.json`. Either require `jq` at install time (one extra dep), or have the agent stick to `grep`/`awk` (uglier but no deps). Lean toward the latter for portability; revisit if accuracy suffers.

4. **Windows native.** Out of scope. Operators on Windows native get directed to WSL or git-bash. If demand emerges, a PowerShell port of `bin/autoship` is feasible without changing the agent or templates.

5. **CI testability.** Bash testing means `bats` (Bash Automated Testing System) for unit tests and `shellcheck` for static checks. Standards-inferrer needs a fixture-repo test suite (small synthetic repos with known evidence → expected standards.yaml). New test infrastructure but well-trodden patterns.

6. **The CLI becomes harness-coupled at the install layer.** Today, `npm install -g` works on any machine with Node. The bash CLI requires `claude` CLI to be installed for inference to work. This is fine for v0.7.0 (Claude Code is the only target) but the eventual multi-harness adapter layer needs to think about which harness's CLI to invoke for inference — possibly `runners.yaml` controls this, with `claude --agent` as the default.

## Followups (post-v0.7.0)

- **Bun-compiled fallback** for operators who need a single binary with zero shell-tool deps. Could compile the bash logic via `bashly` or rewrite hot paths in a small Go/Rust binary.
- **Hooks for autoship verbs.** The bash CLI is a natural place to add pre/post hooks (`.autoship/hooks/pre-deliver.sh` etc.) — much simpler than wedging hooks into a JS lifecycle.
- **`autoship upgrade` self-update verb.** When the install pattern stabilizes.
- **`autoship doctor` health-check verb.** Bash makes this trivial: check claude CLI present, check Linear CLI present, check git config, check .autoship/ integrity, etc.
- **Multi-harness standards-inferrer dispatch.** When a second harness adapter ships, the inference call respects `runners.yaml` and dispatches to whichever harness is active.

## Next steps

1. Validate this design (the document you're reading).
2. Write a writing-plans plan for v0.7.0 implementation.
3. Build `standards-inferrer` agent first — test against autoship-project itself plus 3-5 representative repos (Node, Python, Go, mixed).
4. Confirm output shape matches current `cli/infer-standards.mjs` byte-for-byte on test fixtures (regression check). Any difference is either a bug in the agent or a deliberate improvement to call out.
5. Build the bash CLI in parallel against the validated agent.
6. Ship as v0.7.0 with npm `postinstall` notice; remove npm in v0.8.0.

Estimated calendar time: **2 weeks** for one focused engineer. Half is the agent + fixtures; half is the bash translation + install pipeline + tests.
