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
	'deliver-spec-reviewer.md',
	'deliver-decomposition-reviewer.md',
	'deliver-oracle-writer.md',
	'deliver-oracle-reviewer.md',
	'deliver-implementation.md',
	'ui-walker.md',
];

const CORE_SKILLS = [
	'autoship-audit',
	'deliver-grooming',
	'reviewing',
	'blocker-escalation',
	'ui-walking',
	'test-driven-development',
	'systematic-debugging',
	'receiving-code-review',
];

export async function init(args = []) {
	const cwd = process.cwd();

	if (args.includes('--with-extract')) {
		throw new Error(
			'extract has been retired from the live autoship product. Archived research lives under docs/archive/extract/.'
		);
	}

	// `--no-interactive` is accepted as a no-op for backwards compatibility with
	// scripts and CI that used to pass it; init is unconditionally non-interactive
	// since the interactive wizard was removed (0.6.0+).
	const upgradeFramework = args.includes('--upgrade-framework');
	const allowed = new Set(['--no-interactive', '--upgrade-framework']);
	const unknown = args.filter((a) => !allowed.has(a));
	if (unknown.length) {
		throw new Error(`Unknown init option: ${unknown.join(', ')}`);
	}

	// --upgrade-framework refreshes package-owned files (.claude/agents,
	// .claude/skills, docs/architecture) without touching operator-owned
	// .autoship/ config. Designed for runners that want every dispatch to
	// pick up the latest published agents, while preserving operator edits
	// to standards.yaml / defaults.yaml.
	if (upgradeFramework) {
		return upgradeFrameworkOnly(cwd);
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
	copyArchitectureDocs(cwd);
	console.log('  ✓ core agents → .claude/agents/');
	console.log('  ✓ core skills → .claude/skills/');
	console.log('  ✓ architecture docs → docs/architecture/');

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

	// Write defaults.yaml as the all-commented template. Operators edit it to
	// lock down explicit overrides; otherwise autoship infers source, scope, and
	// validation at runtime from repo evidence.
	writeFileSync(join(autoshipDir, 'defaults.yaml'), renderDefaultsTemplate());
	console.log('  ✓ defaults.yaml → .autoship/  (commented template)');

	// Update .gitignore
	updateGitignore(cwd);
	console.log('  ✓ .gitignore updated');

	printNextSteps();
}

// `autoship init --upgrade-framework` refreshes only the package-owned files
// (.claude/agents, .claude/skills, docs/architecture). Skips wizard, leaves
// .autoship/ untouched. Idempotent and safe to call on every runner dispatch.
function upgradeFrameworkOnly(cwd) {
	console.log('\nautoship init --upgrade-framework\n');
	console.log('Refreshing framework files (.autoship/ left untouched)...');

	copyAgentFiles(CORE_AGENTS, cwd);
	copySkillDirs(CORE_SKILLS, cwd);
	copyArchitectureDocs(cwd);

	console.log('  ✓ .claude/agents/ refreshed');
	console.log('  ✓ .claude/skills/ refreshed');
	console.log('  ✓ docs/architecture/ refreshed');

	if (!existsSync(join(cwd, '.autoship'))) {
		console.log(
			'\nNote: .autoship/ does not exist. Run `autoship init` (without --upgrade-framework) to bootstrap user config.'
		);
	}
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


function printNextSteps() {
	const lines = [
		'',
		'Done.',
		'',
		'  1. Review .autoship/standards.yaml. Inferred fields carry `# inferred from <evidence>` comments; SET_ME fields are your call. Edit directly — autoship does not modify it once it exists. Re-run `autoship init` later for an advisory if repo evidence has changed.',
		'  2. defaults.yaml is the all-commented template. Autoship infers source, scope, and validation at runtime from repo evidence — each inference is announced at run start and logged to .autoship/runs/<run-id>/inferences.jsonl. Uncomment and fill any block in defaults.yaml only when you want to lock down an explicit override.',
		'',
		'  Run autoship:',
		'',
		'       autoship audit --report-only      # zero-config, no tracker writes',
		'       autoship interactive              # open a chat session with the controller',
		'',
		'  If you ran via `npx`, install globally to drop the prefix:',
		'       npm install -g @cs-calibrax/autoship',
		'',
		'  Docs: https://github.com/Calibrax-ai/autoship',
		'',
	];
	console.log(lines.join('\n'));
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

function copyArchitectureDocs(cwd) {
	const src = join(PKG_ROOT, 'docs', 'architecture');
	if (!existsSync(src)) {
		throw new Error('Packaged architecture docs are missing.');
	}

	copyDir(src, join(cwd, 'docs', 'architecture'));
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

function renderDefaultsTemplate() {
	return `# autoship defaults.yaml — optional per-repo overrides.
#
# autoship infers source, scope, and validation from repo evidence at runtime.
# This file is for *overrides* — fields you want to lock down so autoship does
# not infer them. Every block below is commented out by default; uncomment and
# fill in only the fields you want to override.
#
# Flags on the invocation always win. --report-only and --tracker=none are
# always respected even if defaults say otherwise. Each runtime inference is
# announced at run start and logged to .autoship/runs/<run-id>/inferences.jsonl.
#
# Safety note: keep audit.create_issues: false unless you actually want every
# audit run to write into the tracker. Use --approve to opt in per-run.
#
# Recommended remote Linear states:
#   Run Agent       # runner may analyze and, if clear, build
#   Breakdown Proposed   # review the breakdown PR
#   Breakdown Approved   # create child issues and start dependency-free slices
#   Needs Attention      # human unblock

# audit:
#   tracker: linear            # linear | none (GitHub audit sync is not implemented in v1)
#   create_issues: false       # override per-run with --approve
#   external_exposure: false   # override per-run with --external-url=<url>

# deliver:
#   # Set to true to make query/batch runs pause at the preview for [y/N]
#   # confirmation. Default is false — preview is informational, run starts
#   # immediately. The per-run --yes flag forces this off for one run.
#   confirm: false
#
#   # Source override. Skip both blocks to let autoship infer from
#   # \`linear auth list\` + .autoship/issues/ filesystem state.
#   #
#   # folder:
#   #   path: .autoship/issues
#   #
#   # linear:
#   #   team: "Delivery"
#   #   team_key: "DEL"          # Linear short key, used by the linear CLI
#   #   project: "MyProject"     # optional; omit for team-wide selection
#   #   owner: me                # "me" means the authenticated Linear user
#   #   states:
#   #     # Eligibility (which Linear states autoship picks up from)
#   #     # Local/human grooming often uses ["Todo"]. Remote runners wake
#   #     # from the explicit "Run Agent" state instead.
#   #     groom: ["Todo"]
#   #     # Optional supervised-mode compatibility only. Default remote flow
#   #     # uses --auto from Run Agent and does not require Spec Ready.
#   #     build: ["Spec Ready"]
#   #     # Transitions (which states autoship sets at handoffs)
#   #     # State changes are best-effort: missing target states fall back to comment-only.
#   #     working: "In Progress"      # autoship has the baton (grooming or building)
#   #     # Optional supervised-mode handoff:
#   #     spec_ready: "Spec Ready"    # bounded spec complete, awaiting human approval
#   #     breakdown_proposed: "Breakdown Proposed"  # umbrella breakdown ready for review
#   #     blocked: "Needs Attention"  # autoship halted, awaiting human unblock
#   #     pr_open: "In Review"        # draft PR opened, awaiting code review
#
#   # Validation gate override. Skip to let autoship infer from package.json
#   # scripts (test/check/validate), Makefile targets, pyproject.toml, or
#   # Cargo.toml. The inferred gate is baseline-tested before any build run.
#   #
#   # validation:
#   #   commands:
#   #     - "bun test"
`;
}


function quote(value) {
	return JSON.stringify(value);
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
