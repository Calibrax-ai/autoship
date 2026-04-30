# @calibrax/autoship

Turn messy software work into reviewable, reliable delivery — humans approve what matters, agents do the grinding.

Autoship is a set of Claude Code agents and skills for the path from repo readiness to draft pull request: audit turns production gaps into bounded work, groom turns issues into reviewed local specs, and deliver turns one approved spec into frozen tests, implementation, and a draft PR.

## Install

```bash
npx @cs-calibrax/autoship init
```

> **Scope note.** Currently published under the personal scope `@cs-calibrax` while the `@calibrax` org is being set up. The package will migrate to `@calibrax/autoship` once org access is in place; the personal-scope version will be deprecated with a pointer to the new one.

Run from the root of a git repo. The CLI:

- Copies 8 core autoship agents into `.claude/agents/`
- Copies 4 core skill packs into `.claude/skills/`
- Copies live architecture docs into `docs/architecture/` so installed agents can read their required contracts
- Writes `.autoship/standards.yaml` with high-confidence repo policy inferred from evidence (next/prisma/sentry/github-actions/etc.). Each inferred value is annotated with `# inferred from <evidence>`.
- Writes a commented `.autoship/defaults.yaml` overrides template — autoship infers source, scope, and validation at runtime, so this file is for explicit overrides only
- Adds autoship runtime state to `.gitignore`

After the repo evolves, re-run `autoship init` against the existing repo. It will print an advisory — what current evidence would fill into SET_ME slots, where existing values disagree with current evidence — without modifying `standards.yaml`. Copy any fills you want manually. autoship never silently overwrites the file once it exists.

### One-time Linear setup (deliver users)

Deliver uses Linear's workflow-state column as the human ↔ agent baton: a card in `In Progress` means autoship is working it; anywhere else means it's your turn. Remote automation should wake on the explicit `Ready to Groom` state, not on broad `Todo`. The recommended magic flow needs four states beyond the universal `Todo` / `In Progress` / `In Review` set:

- **Ready to Groom** — type `unstarted`, used by the remote runner as the explicit "agent may analyze and, if bounded/clear, build" signal. `Todo` remains a human/local grooming bucket.
- **Breakdown Proposed** — type `unstarted`. Set when grooming detects an umbrella issue and opens a reviewed `[Breakdown]` PR.
- **Breakdown Approved** — type `unstarted`. Move the parent here after reviewing the breakdown PR; autoship creates child issues and starts dependency-free slices.
- **Needs Attention** — type `unstarted`, parallel column. Set when autoship halts on a typed blocker.

`Spec Ready` remains supported for supervised/manual installations, but it is no longer part of the recommended remote happy path.

State and label are orthogonal: state answers "what should happen next?" (baton); PR labels (`autoship`, `autoship:spec`, `autoship:breakdown`, `autoship:need-info`, `autoship:blocked`, `autoship:cannot-reproduce`) answer "what kind of artifact is this?".

Create these manually in your Linear workspace settings (Workflow → States). `autoship init`'s next-steps printout reminds you with the exact names; this is the one piece of setup the CLI can't do for you.

State transitions are best-effort: if a state is missing, autoship still posts the milestone comment and skips the state change rather than failing the run. The kanban-glance UX degrades, but nothing breaks.

For umbrella issues, the magic moment is not the breakdown table; it is the clerical handoff disappearing. Autoship opens a `[Breakdown]` PR with a reviewed work graph, you approve the boundary by moving the issue to `Breakdown Approved` or running `autoship create-issues <id>`, then autoship creates the child Linear issues and moves dependency-free children to `Ready to Groom`. Questions in `decomposition.md` are typed: `blocking` questions must be answered before approval, `defaulted` questions proceed with the stated default unless amended, and `slice-local` questions are copied into the relevant child issue.

## Run autoship

Setup is one-time via `autoship init` (above). Runtime modes — natural-language prompt, `audit`, `groom`, and `deliver` — run through the autoship CLI directly. The CLI spawns Claude Code under the hood with the right agent + prompt.

### Interactive (default)

```bash
autoship audit --report-only           # zero-config, no tracker writes
autoship audit --tracker=linear --approve

autoship "get all Todo issues assigned to me and start grooming"
autoship groom mine --state Todo --yes # skip confirmation after resolving scope
autoship groom FRD-162                 # write local spec
autoship groom FRD-162 --post          # write local spec and mirror summary to Linear
autoship deliver FRD-162               # approve current spec and build one issue
autoship deliver FRD-162 --unattended --auto --post
autoship deliver build FRD-162 --dry-run
autoship create-issues FRD-161         # create child issues from an approved breakdown
autoship materialize FRD-161           # compatibility alias
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

Groom/deliver auto-configures itself from repo evidence — autoship infers source (`linear auth list` + `.autoship/issues/`), Linear scope (`linear team list`), and the validation gate (`package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`) at runtime. Each inference is announced at run start and logged to `.autoship/runs/<run-id>/inferences.jsonl`. `defaults.yaml` exists for explicit overrides only — populated by the wizard during `autoship init`, or left empty to let inference handle everything.

```bash
autoship "get all Todo issues assigned to me and start grooming"  # preview, groom locally
autoship groom FRD-162                                            # write .autoship/issues/<id>/spec.md locally
autoship groom FRD-162 --post                                     # opt into Linear mirroring
autoship deliver FRD-162                                          # approve current spec and build one issue
autoship deliver FRD-162 --unattended --auto --post               # remote-style automatic: groom then build if safe
autoship deliver build FRD-162 --dry-run                          # plan, no push/PR
```

The controller writes `invocation.txt` + `run.json` to the run dir for reproducibility. Grooming writes canonical local specs under `.autoship/issues/<id>/`. Local runs are local-first; pass `--post` to mirror concise milestone summaries and best-effort Linear state changes. Remote runners may pass `--post` as policy.

In automatic mode, Autoship uses the draft PR branch as the durable work envelope: grooming commits `spec.md`, the latest review, and `manifest.json`, opens or updates a spec-first draft PR, then continues into oracle/build only when the reviewed spec is build-worthy. If the spec needs clarification, Autoship parks the issue in `Needs Attention` and does not dispatch build workers.

Completed build PRs include a `Human Review Checklist` so the developer knows what to inspect before merge. For UI/frontend changes, the checklist calls out the visual state to review and includes screenshot or preview evidence when available.

For remote automatic runs, the runner-selected issue and `Ready to Groom` state are the selection authority. The controller may groom/spec from that handoff without a full Linear defaults block, but code changes still require configured or safely inferred validation. If validation is missing or ambiguous, Autoship should leave a reviewed spec/draft handoff and park the issue in `Needs Attention` instead of building.

Per-repo overrides live in `.autoship/defaults.yaml`. Flags on the invocation always win — `--report-only` and `--tracker=none` override stickies. By default, query/batch runs proceed immediately after the preview; set `deliver.confirm: true` per-repo to require a `[y/N]` pause, or use the per-run `--yes` flag as the one-shot opposite.

`autoship deliver --unattended` keeps strict config-as-truth behavior (no inference, no announce affordance). Add `--auto` only when the remote trigger should run grooming and, if review approves the spec, continue directly into build.

Live autoship does not require or read `.autoship/program.md`. The core path uses prompt flags, `.autoship/defaults.yaml`, `.autoship/standards.yaml`, and runtime inference.

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
