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
import { createInterface } from 'node:readline/promises';

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

	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false,
	});

	// Persistent line buffer — captures lines as they arrive even when
	// no question is pending. Required for piped stdin (heredoc, CI).
	const lineQueue = [];
	const waiters = [];
	let stdinClosed = false;

	rl.on('line', (line) => {
		const next = waiters.shift();
		if (next) next(line);
		else lineQueue.push(line);
	});
	rl.on('close', () => {
		stdinClosed = true;
		while (waiters.length) waiters.shift()('');
	});

	const readLine = () =>
		new Promise((resolve) => {
			if (lineQueue.length) return resolve(lineQueue.shift());
			if (stdinClosed) return resolve('');
			waiters.push(resolve);
		});

	const ask = async (q, defaultVal) => {
		const prompt = defaultVal ? `${q} [${defaultVal}]: ` : `${q}: `;
		process.stdout.write(prompt);
		const answer = await readLine();
		const trimmed = (answer || '').trim();
		if (trimmed) process.stdout.write('\n');
		return trimmed || defaultVal || '';
	};

	// Prompts
	const tracker = (
		await ask('Tracker? (linear / github / none)', 'linear')
	).toLowerCase();

	const trackerConfig = {};
	if (tracker === 'linear') {
		trackerConfig.team = await ask('Linear team name (e.g., "Delivery")');
		trackerConfig.project = await ask(
			'Linear project name (e.g., "Gridfin")'
		);
	} else if (tracker === 'github') {
		trackerConfig.repo = await ask('GitHub repo (owner/name)');
	}

	const approvalMode = (
		await ask('Approval mode? (supervised / auto)', 'supervised')
	).toLowerCase();

	const validationCmd = await ask(
		'Validation command after Stage 2 (e.g., "bun test && bun run typecheck")',
		'bun test'
	);

	rl.close();

	console.log('\nInstalling autoship...');

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

	// Write program.md
	const programContent = renderProgram({
		tracker,
		trackerConfig,
		approvalMode,
		validationCmd,
	});
	writeFileSync(join(autoshipDir, 'program.md'), programContent);
	console.log('  ✓ program.md → .autoship/');

	// Write standards.yaml
	writeFileSync(join(autoshipDir, 'standards.yaml'), renderStandards());
	console.log('  ✓ standards.yaml → .autoship/');

	// Update .gitignore
	updateGitignore(cwd);
	console.log('  ✓ .gitignore updated');

	console.log(`
Done. Next steps:

  1. Review .autoship/program.md and adjust any details.
  2. Review .autoship/standards.yaml and set your repo standards (hosting, CI, observability, secrets).${
		tracker === 'linear'
			? '\n  3. Install the Linear MCP: https://docs.anthropic.com/en/docs/mcp'
			: ''
	}
  ${tracker === 'linear' ? 4 : 3}. If this repo uses environment variables, keep .env.example current — autoship treats it as evidence, not the policy source.
  ${tracker === 'linear' ? 5 : 4}. From this directory, run:

       claude --agent autoship-controller -p "deliver"

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
	const autoshipBlock = `
# autoship runtime state
.autoship/runs/
.autoship/issues/
.autoship/worktrees/
.autoship/local.md
`;

	if (existsSync(gitignorePath)) {
		const existing = readFileSync(gitignorePath, 'utf-8');
		if (!existing.includes('.autoship/runs/')) {
			writeFileSync(gitignorePath, existing.trimEnd() + '\n' + autoshipBlock);
		}
	} else {
		writeFileSync(gitignorePath, autoshipBlock.trimStart());
	}
}

function renderProgram({ tracker, trackerConfig, approvalMode, validationCmd }) {
	const validationLines = validationCmd
		.split('&&')
		.map((c) => c.trim())
		.filter(Boolean)
		.map((c) => `    - "${c}"`)
		.join('\n');

	let issueSourceBlock;
	if (tracker === 'linear') {
		issueSourceBlock = `issue_source: linear

linear:
  team: "${trackerConfig.team || 'SET_ME'}"
  project: "${trackerConfig.project || 'SET_ME'}"
  grooming_states: [Backlog, Todo]
  build_states: [Building]
  eligible_labels: []
  max_concurrent: 1
`;
	} else if (tracker === 'github') {
		issueSourceBlock = `issue_source: github

github:
  repo: "${trackerConfig.repo || 'SET_ME/SET_ME'}"
  eligible_labels: [ready-for-autoship]
  max_concurrent: 1
`;
	} else {
		issueSourceBlock = `issue_source: folder

folder:
  path: .autoship/issues/
`;
	}

	const linearWritesBlock =
		tracker === 'linear'
			? `
linear_writes:
  state_transitions: true
  comments: true
  labels: false
  sub_issue_creation: false

state_map:
  on_claim: "Grooming"
  on_ready: "Ready"
  on_build_start: "Building"
  on_draft_pr: "In Review"
  on_needs_human_input: "needs-human-input"
`
			: '';

	return `# autoship program.md — deliver run contract
# Generated by \`autoship init\`. Commit this file — the whole team shares the run contract.
# Reference: https://github.com/Calibrax-ai/autoship/blob/main/docs/architecture/deliver-program-template.md

mode: deliver

# Approval mode: supervised (human promotes to Building) or auto (reviewer-agent promotes).
approval_mode: ${approvalMode}

${issueSourceBlock}
max_regroom_cycles: 3

worktree:
  root: .autoship/worktrees
  branch_prefix: "autoship/"

validation:
  commands:
${validationLines}

pr:
  remote: origin
  draft: true
  base_branch: main
${linearWritesBlock}`;
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
