# @calibrax/autoship

Turn messy software work into reviewable, reliable delivery — humans approve what matters, agents do the grinding.

Autoship is a set of Claude Code agents and skills that take an approved ticket and produce a draft pull request: the brief is written, judged by a separate reviewer, promoted by a human, then the tests and code are written by two more agents before a human reviews the draft PR.

## Install

```bash
npx @cs-calibrax/autoship init
```

> **Scope note.** Currently published under the personal scope `@cs-calibrax` while the `@calibrax` org is being set up. The package will migrate to `@calibrax/autoship` once org access is in place; the personal-scope version will be deprecated with a pointer to the new one.

Run from the root of a git repo. The CLI:

- Copies 13 autoship agents into `.claude/agents/`
- Copies skill packs into `.claude/skills/`
- Creates a `.autoship/program.md` run contract from an interactive prompt (tracker, approval mode, validation command)
- Adds autoship runtime state to `.gitignore`

## Run

```bash
claude --agent controller -p "deliver"
```

The controller reads `.autoship/program.md`, claims an eligible issue from your tracker, drives it through grooming → human approval → build → draft pull request.

## Requires

- [Claude Code](https://claude.com/claude-code) installed
- Node.js >= 20 (for the installer)
- A git repo and a tracker you've configured (Linear, GitHub Issues, or a folder-based flow)

## Learn more

- **Docs site** — [autoship.dev](https://github.com/Calibrax-ai/autoship)
- **System overview** — how extract and deliver fit together
- **Learnings** — what we've learned across ten probes

## Not to be confused with

There is a separate `autoship` package on npm (unscoped) by vercel-labs for changeset-based releases. Different product, same word. Use `@calibrax/autoship` for the framework described here.

## License

MIT
