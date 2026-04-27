# @calibrax/autoship

Turn messy software work into reviewable, reliable delivery — humans approve what matters, agents do the grinding.

Autoship is a set of Claude Code agents and skills for the path from repo readiness to draft pull request: audit turns production gaps into bounded work, deliver turns approved work into a reviewed brief, frozen tests, implementation, and a draft PR.

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

## Run autoship

Setup is one-time via `autoship init` (above). Runtime modes — `audit` and `deliver` — are driven through the `autoship-controller` agent that init scaffolds into `.claude/agents/`. Two ways to invoke it:

### Headless, one-shot (`-p`)

Best for CI, scripts, or bounded runs that should exit when the controller stops.

```bash
claude --agent autoship-controller -p "audit --report-only"
```

The controller runs to a stop condition and exits. Disk-backed state under `.autoship/` means re-running picks up where it left off.

### Interactive chat session

Best when you want to watch the run unfold, review artifacts as they land, or push back on framing mid-flight.

```bash
claude --agent autoship-controller
```

Drops you into a chat with the controller loaded. Type `audit --report-only`, `deliver FRD-162`, or any natural-language prompt the controller accepts. Same RunRequest contract as headless mode.

> Already in an existing Claude Code session in the same repo? You can also dispatch the autoship-controller as a subagent from there — see [Claude Code's subagent docs](https://code.claude.com/docs/en/sub-agents.md).

## What to run

Audit is zero-config:

```bash
claude --agent autoship-controller -p "audit --report-only"
claude --agent autoship-controller -p "audit --tracker=linear --approve"
```

Deliver needs an issue source and a validation command first. Configure `.autoship/defaults.yaml`, or create a local `.autoship/issues/<id>/issue.md` for folder mode and set `deliver.validation.commands`, then pass flags or a natural-language prompt to the controller:

```bash
claude --agent autoship-controller -p "deliver"                          # resume in-flight
claude --agent autoship-controller -p "deliver FRD-162"                  # one issue
claude --agent autoship-controller -p "deliver groom FRD-162"            # force groom phase
claude --agent autoship-controller -p "deliver build FRD-162 --dry-run"  # plan, no push/PR
```

The controller resolves a `RunRequest`, writes `invocation.txt` + `run.json` to the run dir for reproducibility, and drives the issue through grooming → human approval → build → draft pull request.

Per-repo sticky defaults go in optional `.autoship/defaults.yaml`. Flags on the invocation always win — `--report-only` and `--tracker=none` override stickies.

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
