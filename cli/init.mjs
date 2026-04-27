import {
	existsSync,
	mkdirSync,
	readdirSync,
	copyFileSync,
	readFileSync,
	writeFileSync,
	statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const CORE_AGENTS = [
	'autoship-controller.md',
	'audit-auditor.md',
	'audit-reviewer.md',
	'deliver-pre-groomer.md',
	'deliver-brief-reviewer.md',
	'deliver-oracle-writer.md',
	'deliver-implementation.md',
];

const EXTRACT_AGENTS = [
	'extract-ui-walker.md',
	'extract-static.md',
	'extract-data.md',
	'extract-external.md',
	'extract-reconciler.md',
	'extract-critic.md',
	'extract-build-controller.md',
	'extract-plan-reviewer.md',
];

const CORE_SKILLS = [
	'autoship-audit',
	'deliver-grooming',
	'reviewing',
	'blocker-escalation',
];

const EXTRACT_SKILLS = [
	'reverse-spec-extraction',
	'extract-build',
];

export async function init(args = []) {
	const cwd = process.cwd();
	const withExtract = args.includes('--with-extract');
	const unknownArgs = args.filter((arg) => arg !== '--with-extract');

	if (unknownArgs.length) {
		throw new Error(`Unknown init option: ${unknownArgs.join(', ')}`);
	}

	console.log('\nautoship init\n');

	// Preconditions
	if (!existsSync(join(cwd, '.git'))) {
		console.warn(
			'Warning: this directory does not look like a git repo. autoship expects a git repo.\n'
		);
	}
	if (existsSync(join(cwd, '.autoship'))) {
		throw new Error(
			'.autoship/ already exists here. Run `autoship update` to refresh (not yet implemented).'
		);
	}

	console.log('Installing autoship...');

	// Copy core agents + skills. Extract is optional because it is a legacy
	// research pack and should not dominate the default product surface.
	copyAgentFiles(CORE_AGENTS, cwd);
	copySkillDirs(CORE_SKILLS, cwd);
	console.log('  ✓ core agents → .claude/agents/');
	console.log('  ✓ core skills → .claude/skills/');

	if (withExtract) {
		copyAgentFiles(EXTRACT_AGENTS, cwd);
		copySkillDirs(EXTRACT_SKILLS, cwd);
		console.log('  ✓ extract agents → .claude/agents/');
		console.log('  ✓ extract skills → .claude/skills/');
	}

	// Create .autoship/
	const autoshipDir = join(cwd, '.autoship');
	mkdirSync(autoshipDir, { recursive: true });

	// Write standards.yaml (repo policy — always scaffolded)
	writeFileSync(join(autoshipDir, 'standards.yaml'), renderStandards());
	console.log('  ✓ standards.yaml → .autoship/');

	// Write defaults.yaml (optional per-repo stickies — commented template,
	// inert until the operator uncomments fields)
	writeFileSync(join(autoshipDir, 'defaults.yaml'), renderDefaults());
	console.log('  ✓ defaults.yaml → .autoship/  (commented template)');

	// Update .gitignore
	updateGitignore(cwd);
	console.log('  ✓ .gitignore updated');

	console.log(`
Done. Next steps:

  1. Review or draft .autoship/standards.yaml — hosting, CI, observability, secrets. autoship treats SET_ME values as decision-required.

       claude --agent autoship-controller -p "draft standards from this repo"

  2. (Optional) Uncomment per-repo stickies in .autoship/defaults.yaml — tracker, validation command, branch prefix. Flags on the invocation always win.
  3. If using Linear: install the Linear MCP — https://docs.anthropic.com/en/docs/mcp
  4. If this repo uses environment variables, keep .env.example current — autoship treats it as evidence, not the policy source.
  5. Try the zero-config audit smoke test:

       claude --agent autoship-controller -p "audit --report-only"

  6. Before deliver, configure an issue source and validation command:

       # Option A: uncomment deliver.tracker + deliver.validation in .autoship/defaults.yaml
       # Option B: create .autoship/issues/<id>/issue.md for folder/local mode and uncomment deliver.validation

     Then run:

       claude --agent autoship-controller -p "deliver"

       claude --agent autoship-controller -p "deliver FRD-162"

  Docs: https://github.com/Calibrax-ai/autoship
`);
}

function copyAgentFiles(files, cwd) {
	const srcDir = join(PKG_ROOT, '.claude', 'agents');
	const destDir = join(cwd, '.claude', 'agents');
	mkdirSync(destDir, { recursive: true });

	for (const file of files) {
		copyFileSync(join(srcDir, file), join(destDir, file));
	}
}

function copySkillDirs(dirs, cwd) {
	for (const dir of dirs) {
		const src = join(PKG_ROOT, '.claude', 'skills', dir);
		if (!existsSync(src)) {
			throw new Error(`Packaged skill is missing: ${dir}`);
		}
		copyDir(
			src,
			join(cwd, '.claude', 'skills', dir)
		);
	}
}

function copyDir(src, dest) {
	mkdirSync(dest, { recursive: true });
	for (const entry of readdirSync(src)) {
		const s = join(src, entry);
		const d = join(dest, entry);
		if (statSync(s).isDirectory()) {
			copyDir(s, d);
		} else {
			copyFileSync(s, d);
		}
	}
}

function updateGitignore(cwd) {
	const gitignorePath = join(cwd, '.gitignore');
	const autoshipLines = [
		'# autoship runtime state',
		'.autoship/audits/',
		'.autoship/runs/',
		'.autoship/issues/',
		'.autoship/worktrees/',
		'.autoship/local.md',
	];

	if (existsSync(gitignorePath)) {
		const existing = readFileSync(gitignorePath, 'utf-8');
		const missing = autoshipLines.filter((line) => !existing.includes(line));
		if (missing.length) {
			writeFileSync(
				gitignorePath,
				existing.trimEnd() + '\n\n' + missing.join('\n') + '\n'
			);
		}
	} else {
		writeFileSync(gitignorePath, autoshipLines.join('\n') + '\n');
	}
}

function renderDefaults() {
	return `# autoship defaults.yaml — optional per-repo sticky run defaults
# Uncomment and fill in values you want autoship to assume when you don't
# pass them as flags. Flags on the invocation always win. --report-only
# and --tracker=none are always respected even if defaults say otherwise.
#
# Safety note: keep create_issues: false unless you actually want every
# audit run to write into the tracker. Use --approve to opt in per-run.

# audit:
#   tracker: linear            # linear | none (GitHub audit sync is not implemented in v1)
#   create_issues: false       # override per-run with --approve
#   external_exposure: false   # override per-run with --external-url=<url>

# deliver:
#   tracker: folder            # folder | linear | github
#   folder:
#     path: .autoship/issues
#   linear:
#     team: "Delivery"
#     project: "MyProject"
#   worktree:
#     root: .autoship/worktrees
#     branch_prefix: "autoship/"
#   validation:
#     commands:
#       - "bun test"
#   pr:
#     remote: origin
#     draft: true
#     base_branch: main
#   approval_mode: supervised   # supervised | auto
#   max_regroom_cycles: 3
`;
}

function renderStandards() {
	return `# autoship standards.yaml — repo/org policy for controller-guided work
# Commit this file. Keep it short and specific. These are the defaults autoship
# should assume when auditing or delivering work in this repo.

platform:
  hosting: "SET_ME"        # e.g. gcp, vercel, aws
  deploy: "SET_ME"         # e.g. cloud-run, app-runner, vercel

ci:
  provider: "SET_ME"       # e.g. github-actions
  required_checks: []      # e.g. [test, typecheck, build]

observability:
  errors: "SET_ME"         # e.g. sentry
  logs: "SET_ME"           # e.g. cloud-logging, datadog
  traces: "none"           # e.g. none, opentelemetry

database:
  migrations: "SET_ME"     # e.g. prisma, drizzle, rails
  rollback_required: true

secrets:
  provider: "SET_ME"       # e.g. gcp-secret-manager, vercel-env, doppler

security:
  dependency_scan: "SET_ME" # e.g. npm-audit, snyk, github-dependabot, none
  secret_scan: "SET_ME"     # e.g. gitleaks, github-secret-scanning, none
  rate_limits_required: true

tenancy:
  model: "single-tenant"    # single-tenant, multi-tenant, account-scoped
  isolation_required: false

roles:
  model: "SET_ME"           # e.g. none, user-admin, org-roles, rbac

async:
  provider: "none"          # e.g. none, inngest, bullmq, cloud-tasks, sqs
  retries_required: true
  idempotency_required: true

performance:
  latency_budget: "SET_ME"  # e.g. p95 < 500ms on core flows, SET_ME
  load_test_required: false

release:
  require_smoke_test: true
  require_manual_approval: true

audit:
  if_no_standard: decision-required
`;
}
