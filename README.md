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
- Writes `.autoship/standards.yaml` (repo policy defaults you review or draft)
- Writes an optional commented `.autoship/defaults.yaml` template for per-repo run defaults
- Adds autoship runtime state to `.gitignore`

The legacy extract research pack is optional:

```bash
npx @cs-calibrax/autoship init --with-extract
```

That additionally installs the extract probe/build agents and extract-specific skills.

## Run

Optionally draft repo policy from codebase evidence first:

```bash
claude --agent autoship-controller -p "draft standards from this repo"
```

The controller fills high-confidence values in `.autoship/standards.yaml`, leaves ambiguous policy as `SET_ME`, and does not create a separate evidence artifact.

Core audit/deliver do not require or read `.autoship/program.md`. The optional extract research pack keeps its legacy `program.md` mechanics; the core path uses prompt flags, `.autoship/defaults.yaml`, and `.autoship/standards.yaml`.

The audit smoke test is zero-config:

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
