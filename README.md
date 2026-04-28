# @calibrax/autoship

Turn messy software work into reviewable, reliable delivery — humans approve what matters, agents do the grinding.

Autoship is a set of Claude Code agents and skills for the path from repo readiness to draft pull request: audit turns production gaps into bounded work, groom turns issues into reviewed local specs, and deliver turns one approved spec into frozen tests, implementation, and a draft PR.

## Install

```bash
npx @cs-calibrax/autoship init
```

> **Scope note.** Currently published under the personal scope `@cs-calibrax` while the `@calibrax` org is being set up. The package will migrate to `@calibrax/autoship` once org access is in place; the personal-scope version will be deprecated with a pointer to the new one.

Run from the root of a git repo. The CLI:

- Copies 7 core autoship agents into `.claude/agents/`
- Copies 4 core skill packs into `.claude/skills/`
- Writes `.autoship/standards.yaml` with high-confidence repo policy inferred from evidence (next/prisma/sentry/github-actions/etc.). Each inferred value is annotated with `# inferred from <evidence>`.
- Writes an optional commented `.autoship/defaults.yaml` template for per-repo run defaults
- Adds autoship runtime state to `.gitignore`

After the repo evolves, re-run `autoship init` against the existing repo. It will print an advisory — what current evidence would fill into SET_ME slots, where existing values disagree with current evidence — without modifying `standards.yaml`. Copy any fills you want manually. autoship never silently overwrites the file once it exists.

### One-time Linear setup (deliver users)

Deliver uses Linear's workflow-state column as the human ↔ agent baton: a card in `In Progress` means autoship is working it; anywhere else means it's your turn. This needs two extra states beyond the universal `Todo` / `In Progress` / `In Review` set:

- **Spec Ready** — type `unstarted`, position between `Todo` and `In Progress`. Set when grooming finishes and a reviewed spec is waiting on you to run `autoship deliver <id>`.
- **Needs Attention** — type `unstarted`, parallel column. Set when autoship halts on a typed blocker.

Create both manually in your Linear workspace settings (Workflow → States). `autoship init`'s next-steps printout reminds you with the exact names; this is the one piece of setup the CLI can't do for you.

State transitions are best-effort: if either state is missing, autoship still posts the milestone comment and skips the state change rather than failing the run. The kanban-glance UX degrades, but nothing breaks.

## Run autoship

Setup is one-time via `autoship init` (above). Runtime modes — natural-language prompt, `audit`, `groom`, and `deliver` — run through the autoship CLI directly. The CLI spawns Claude Code under the hood with the right agent + prompt.

### Interactive (default)

```bash
autoship audit --report-only           # zero-config, no tracker writes
autoship audit --tracker=linear --approve

autoship "get all Todo issues assigned to me and start grooming"
autoship groom mine --state Todo --yes # skip confirmation after resolving scope
autoship groom FRD-162                 # write local spec; mirror milestones to Linear (--no-post for silent)
autoship deliver FRD-162               # approve current spec and build one issue
autoship deliver build FRD-162 --dry-run
```

Default mode is interactive — the CLI opens a Claude Code session with the controller agent loaded and your prompt as the first user message. Output streams as the controller runs; the session stays open after for follow-ups. Disk-backed state under `.autoship/` means re-running picks up where it left off.

Add `--print` for headless mode (CI / pipes — runs to completion, prints the final response, exits):

```bash
autoship audit --report-only --print
```

### Interactive chat session

Best when you want to watch the run unfold, review artifacts as they land, or push back on framing mid-flight.

```bash
autoship interactive
```

Drops you into a chat with the controller loaded. Type `audit --report-only`, `groom FRD-162`, `deliver FRD-162`, or any natural-language prompt.

> Set `AUTOSHIP_PRINT=1` to see the underlying `claude --agent autoship-controller ...` command without running it. Useful when wiring autoship into CI.

> Already in an existing Claude Code session in the same repo? You can also dispatch the autoship-controller as a subagent from there — see [Claude Code's subagent docs](https://code.claude.com/docs/en/sub-agents.md).

## What to run

Audit is zero-config:

```bash
autoship audit --report-only
autoship audit --tracker=linear --approve
```

Groom/deliver need an issue source and a validation command first. The wizard in `autoship init` collects both; otherwise edit `.autoship/defaults.yaml` and configure exactly one source block (`deliver.linear` or `deliver.folder`) plus `deliver.validation.commands`. Then:

```bash
autoship "get all Todo issues assigned to me and start grooming"  # preview, confirm, groom locally
autoship groom FRD-162                                            # write .autoship/issues/<id>/spec.md, mirror to Linear
autoship groom FRD-162 --no-post                                  # local-only, no Linear writes
autoship deliver FRD-162                                          # approve current spec and build one issue
autoship deliver build FRD-162 --dry-run                          # plan, no push/PR
```

The controller writes `invocation.txt` + `run.json` to the run dir for reproducibility. Grooming writes canonical local specs under `.autoship/issues/<id>/`. Each deliver milestone (groom-start, spec-ready, build-start, PR-open, blocker) fires a Linear state change + a comment with @mention to the assignee — `--post` is on by default; pass `--no-post` for a fully silent run.

Per-repo sticky defaults live in `.autoship/defaults.yaml`. Flags on the invocation always win — `--report-only` and `--tracker=none` override stickies. Set `deliver.confirm: false` to make query/batch runs proceed immediately after the preview instead of waiting for `[y/N]`; the per-run `--yes` flag is the one-shot equivalent.

Live autoship does not require or read `.autoship/program.md`. The core path uses prompt flags, `.autoship/defaults.yaml`, and `.autoship/standards.yaml`.

## Requires

- [Claude Code](https://claude.com/claude-code) installed
- Node.js >= 20 (for the installer)
- A git repo and a configured work source. Audit tracker writes are Linear-only in v1; deliver can use Linear or the folder-based flow.

## Learn more

- **Docs site** — [autoship.dev](https://github.com/Calibrax-ai/autoship)
- **System overview** — how audit and deliver form the core product path
- **Learnings** — what we've learned across ten probes

## Not to be confused with

There is a separate `autoship` package on npm (unscoped) by vercel-labs for changeset-based releases. Different product, same word. Use `@calibrax/autoship` for the framework described here.

## License

MIT
