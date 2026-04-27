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

import { inferStandards, applyInferences } from './infer-standards.mjs';

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

const CORE_SKILLS = [
	'autoship-audit',
	'deliver-grooming',
	'reviewing',
	'blocker-escalation',
];

export async function init(args = []) {
	const cwd = process.cwd();

	if (args.includes('--with-extract')) {
		throw new Error(
			'extract has been retired from the live autoship product. Archived research lives under docs/archive/extract/.'
		);
	}

	if (args.length) {
		throw new Error(`Unknown init option: ${args.join(', ')}`);
	}

	// If .autoship/ already exists, init becomes advisory: print what current
	// evidence suggests, never touch the file. Operator owns standards.yaml
	// after first install — same shape as Claude Code's /init on an existing
	// CLAUDE.md.
	if (existsSync(join(cwd, '.autoship'))) {
		return printAdvisory(cwd);
	}

	console.log('\nautoship init\n');

	// Preconditions
	if (!existsSync(join(cwd, '.git'))) {
		console.warn(
			'Warning: this directory does not look like a git repo. autoship expects a git repo.\n'
		);
	}

	console.log('Installing autoship...');

	// Copy core agents + skills.
	copyAgentFiles(CORE_AGENTS, cwd);
	copySkillDirs(CORE_SKILLS, cwd);
	console.log('  ✓ core agents → .claude/agents/');
	console.log('  ✓ core skills → .claude/skills/');

	// Create .autoship/
	const autoshipDir = join(cwd, '.autoship');
	mkdirSync(autoshipDir, { recursive: true });

	// Build standards.yaml. Inference is always on at install time — wrong
	// guesses are reviewable inline (each carries a `# inferred from <evidence>`
	// comment) and cost only an SET_ME edit if the operator wants to override.
	const baseline = renderStandardsTemplate();
	const inferences = inferStandards(cwd);
	const { yaml: standardsYaml, filled } = applyInferences(baseline, inferences);
	writeFileSync(join(autoshipDir, 'standards.yaml'), standardsYaml);
	const setMeCount = (standardsYaml.match(/"SET_ME"/g) || []).length;
	console.log(
		`  ✓ standards.yaml → .autoship/  (filled ${filled.length} from evidence; ${setMeCount} still SET_ME)`
	);

	// Write defaults.yaml (optional per-repo stickies — commented template,
	// inert until the operator uncomments fields)
	writeFileSync(join(autoshipDir, 'defaults.yaml'), renderDefaults());
	console.log('  ✓ defaults.yaml → .autoship/  (commented template)');

	// Update .gitignore
	updateGitignore(cwd);
	console.log('  ✓ .gitignore updated');

	console.log(`
Done. Next steps:

  1. Review .autoship/standards.yaml. Inferred fields are commented with their evidence; SET_ME fields are your call. Edit the file directly to update policy — autoship does not modify it once it exists. Re-run \`autoship init\` later to see an advisory if repo evidence has changed.

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

// Re-running `autoship init` on an existing .autoship/ prints an advisory:
// what current repo evidence would fill into SET_ME slots, and where existing
// non-SET_ME values disagree with current evidence. Never touches the file.
function printAdvisory(cwd) {
	console.log(
		'\n.autoship/ already exists. Live policy lives in .autoship/standards.yaml — edit directly.\n'
	);

	const standardsPath = join(cwd, '.autoship', 'standards.yaml');
	if (!existsSync(standardsPath)) {
		console.log(
			'(no standards.yaml found under .autoship/ — remove the directory and re-run `autoship init` to bootstrap from scratch)\n'
		);
		return;
	}

	const current = readFileSync(standardsPath, 'utf-8');
	const inferences = inferStandards(cwd);
	const { filled, conflicts } = applyInferences(current, inferences);

	if (filled.length === 0 && conflicts.length === 0) {
		console.log('Advisory: current standards.yaml matches repo evidence. Nothing to suggest.\n');
		return;
	}

	if (filled.length > 0) {
		console.log(
			`Advisory — repo evidence suggests these fills for SET_ME slots (${filled.length}):`
		);
		for (const f of filled) {
			console.log(`  ${f.key}: ${formatYAMLValue(f.value)}  # from ${f.source}`);
		}
		console.log('');
	}

	if (conflicts.length > 0) {
		console.log(
			`Conflicts — existing values disagree with current evidence (${conflicts.length}):`
		);
		for (const c of conflicts) {
			console.log(
				`  ${c.key}: existing=${formatYAMLValue(c.existing)} vs inferred=${formatYAMLValue(c.inferred)}  (from ${c.source})`
			);
		}
		console.log('');
	}

	console.log(
		'Copy any fills you want into .autoship/standards.yaml. autoship does not modify the file once it exists.\n'
	);
}

function formatYAMLValue(value) {
	if (Array.isArray(value)) return '[' + value.map((v) => JSON.stringify(v)).join(', ') + ']';
	if (typeof value === 'string') return JSON.stringify(value);
	return String(value);
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

function renderStandardsTemplate() {
	return `# autoship standards.yaml — repo/org policy for controller-guided work
# Commit this file. Keep it short and specific. These are the defaults autoship
# should assume when auditing or delivering work in this repo.
# Fields with a "# inferred from ..." comment were filled by autoship init from
# repo evidence — review and override as needed. SET_ME means autoship couldn't
# infer a value confidently and treats it as decision-required.

platform:
  hosting: "SET_ME"        # e.g. gcp, vercel, aws
  deploy: "SET_ME"         # e.g. cloud-run, app-runner, vercel

ci:
  provider: "SET_ME"       # e.g. github-actions
  required_checks: []      # e.g. [test, typecheck, build]

observability:
  errors: "SET_ME"         # e.g. sentry
  logs: "SET_ME"           # e.g. cloud-logging, datadog
  traces: "SET_ME"         # e.g. none, opentelemetry

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
  model: "SET_ME"           # single-tenant, multi-tenant, account-scoped
  isolation_required: false

roles:
  model: "SET_ME"           # e.g. none, user-admin, org-roles, rbac

async:
  provider: "SET_ME"        # e.g. none, inngest, bullmq, cloud-tasks, sqs
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
