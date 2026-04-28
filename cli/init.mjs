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
import { stdin, stdout } from 'node:process';

import { select, input } from '@inquirer/prompts';

import { inferStandards, applyInferences } from './infer-standards.mjs';
import {
	checkLinearCli,
	checkLinearAuth,
	listTeams,
	listProjects,
} from './linear-cli.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const CORE_AGENTS = [
	'autoship-controller.md',
	'audit-auditor.md',
	'audit-reviewer.md',
	'deliver-pre-groomer.md',
	'deliver-spec-reviewer.md',
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

	const noInteractive = args.includes('--no-interactive');
	const unknown = args.filter((a) => a !== '--no-interactive');
	if (unknown.length) {
		throw new Error(`Unknown init option: ${unknown.join(', ')}`);
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

	// Run the setup wizard if we're in a TTY and the user didn't opt out.
	// Non-TTY (CI, piped invocations) writes the all-commented template.
	const interactive = !noInteractive && stdin.isTTY && stdout.isTTY;
	let answers = null;
	if (interactive) {
		try {
			answers = await runWizard(cwd);
		} catch (err) {
			console.warn(`\nWizard skipped (${err.message}). Falling back to commented template.\n`);
			answers = null;
		}
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

	// Write defaults.yaml. With wizard answers, write a populated config;
	// without (CI / non-TTY / wizard skipped), write the all-commented template.
	writeFileSync(join(autoshipDir, 'defaults.yaml'), renderDefaults(answers));
	console.log(
		answers
			? `  ✓ defaults.yaml → .autoship/  (${describeAnswers(answers)})`
			: '  ✓ defaults.yaml → .autoship/  (commented template)'
	);

	// Update .gitignore
	updateGitignore(cwd);
	console.log('  ✓ .gitignore updated');

	printNextSteps(answers);
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

// ---- Wizard ----
//
// Interactive setup that runs at install time when stdin is a TTY. Collects
// the minimum answers needed to write a populated defaults.yaml: issue source,
// Linear team/project scope, default owner/states, and validation command. When
// Linear is selected, drives the `linear` CLI live to discover real teams and
// projects so the operator picks from real options instead of typing strings
// that might not exist.
//
// Skips entirely in CI / non-TTY contexts (init.mjs entry point checks isTTY);
// falls back to manual entry when Linear CLI is missing or not authed.
async function runWizard(cwd) {
	// Show what we detected as context for the operator.
	const inferences = inferStandards(cwd);
	const detected = describeDetectedStack(inferences);
	console.log(`Detecting repo evidence... ${detected || '(no specific framework markers)'}\n`);

	// Tracker choice.
	const tracker = await select({
		message: 'Issue tracker?',
		choices: [
			{ name: 'Linear  (drives the `linear` CLI to discover teams + projects)', value: 'linear' },
			{ name: 'Local folder  (.autoship/issues/<id>/issue.md)', value: 'folder' },
			{ name: 'Skip — configure later', value: 'skip' },
		],
		default: 'folder',
	});

	let linear = null;
	if (tracker === 'linear') {
		linear = await collectLinearAnswers();
	}

	// Validation command — autoship runs this after each implementation.
	let validation = null;
	if (tracker !== 'skip') {
		console.log('');
		const scripts = readPackageScripts(cwd);
		const suggestion = pickValidationSuggestion(cwd, scripts);
		if (scripts.length) {
			console.log(`Detected scripts in package.json: ${scripts.join(', ')}`);
		}
		validation = await input({
			message: 'Validation command (autoship runs this after each implementation):',
			default: suggestion || '',
		});
		validation = validation.trim() || null;
	}

	console.log('');
	return { tracker, linear, validation };
}

// Collects the Linear-specific answers, driving the CLI live where possible.
// Falls back to manual entry when CLI is missing, not authed, or returns
// empty/null.
async function collectLinearAnswers() {
	const cliPath = checkLinearCli();
	if (!cliPath) {
		console.log('  ⚠ `linear` CLI not found on PATH.');
		console.log('    Install: brew install linear-cli');
		console.log('    Or use Linear MCP: https://docs.anthropic.com/en/docs/mcp');
		console.log('    Falling back to manual entry — autoship will halt at runtime if Linear isn\'t reachable.\n');
		return await collectLinearAnswersManual();
	}

	console.log(`  ✓ \`linear\` CLI found at ${cliPath}`);
	if (!checkLinearAuth()) {
		console.log('  ⚠ Not logged in to Linear. Run `linear auth login` and re-run autoship init.');
		console.log('    Falling back to manual entry.\n');
		return await collectLinearAnswersManual();
	}
	console.log('  ✓ authenticated\n');

	// Team — discover from CLI.
	const teams = listTeams();
	let teamKey, teamName;
	if (!teams || teams.length === 0) {
		console.log('  ⚠ Could not list Linear teams. Falling back to manual entry.\n');
		return await collectLinearAnswersManual();
	}
	if (teams.length === 1) {
		teamKey = teams[0].key;
		teamName = teams[0].name;
		console.log(`  Team: ${teamName} (${teamKey}) — only team in workspace, auto-selected.\n`);
	} else {
		const picked = await select({
			message: 'Linear team?',
			choices: teams.map((t) => ({ name: `${t.name} (${t.key})`, value: t.key })),
		});
		teamKey = picked;
		teamName = teams.find((t) => t.key === picked).name;
	}

	// Project — discover from CLI.
	const projects = listProjects(teamKey);
	let projectName = null;
	if (projects && projects.length > 0) {
		const choices = projects.map((p) => ({ name: p.name, value: p.name }));
		choices.push({ name: '(skip — no project filter)', value: '' });
		projectName = await select({ message: 'Linear project?', choices });
		if (!projectName) projectName = null;
	} else {
		console.log('  (no projects discovered for this team — skipping)\n');
	}

	console.log('\nLinear work selection defaults:');
	console.log('  owner: me');
	console.log('  groom states: Todo');
	console.log('  build states: Spec Ready  (create this state in Linear — see Done section)\n');

	return {
		team: teamName,
		teamKey,
		project: projectName,
		owner: 'me',
		states: {
			groom: ['Todo'],
			build: ['Spec Ready'],
		},
	};
}

async function collectLinearAnswersManual() {
	const team = (await input({ message: 'Linear team name (e.g. Engineering, Delivery):' })).trim();
	const teamKey = (await input({ message: 'Linear team key (e.g. ENG, DEL — used by linear CLI):' })).trim();
	const project = (await input({ message: 'Linear project name (e.g. MyProject):' })).trim();

	console.log('\nUsing default Linear work selection: owner=me, groom=Todo, build=Spec Ready.\n');

	return {
		team,
		teamKey,
		project: project || null,
		owner: 'me',
		states: {
			groom: ['Todo'],
			build: ['Spec Ready'],
		},
	};
}

function readPackageScripts(cwd) {
	try {
		const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
		return pkg.scripts && typeof pkg.scripts === 'object' ? Object.keys(pkg.scripts) : [];
	} catch {
		return [];
	}
}

function pickValidationSuggestion(cwd, scripts) {
	const runner = detectPkgRunner(cwd);
	const preferred = ['test', 'check', 'validate'];
	for (const name of preferred) {
		if (scripts.includes(name)) {
			return name === 'test' ? `${runner} test` : `${runner} run ${name}`;
		}
	}
	return null;
}

function detectPkgRunner(cwd) {
	if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
	if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
	if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
	return 'npm';
}

function describeDetectedStack({ values }) {
	const items = [];
	if (values['platform.hosting'] === 'vercel') items.push('Next.js/Vercel');
	if (values['platform.hosting'] === 'fly.io') items.push('Fly');
	if (values['platform.hosting'] === 'cloudflare-workers') items.push('Cloudflare Workers');
	if (values['platform.hosting'] === 'container') items.push('Container');
	if (values['database.migrations'] === 'prisma migrate') items.push('Prisma');
	if (values['database.migrations'] === 'drizzle-kit') items.push('Drizzle');
	if (values['database.migrations'] === 'alembic') items.push('Alembic');
	if (values['ci.provider']) items.push(values['ci.provider']);
	if (values['observability.errors'] === 'sentry') items.push('Sentry');
	if (values['observability.errors'] === 'datadog') items.push('Datadog');
	if (values['async.provider'] === 'bullmq') items.push('BullMQ');
	if (values['async.provider'] === 'celery') items.push('Celery');
	return items.length ? items.join(' + ') : null;
}

function describeAnswers(answers) {
	const parts = [`source=${answers.tracker}`];
	if (answers.linear) {
		parts.push(`team=${answers.linear.teamKey || answers.linear.team}`);
		parts.push(`owner=${answers.linear.owner || 'me'}`);
		parts.push(`groom=${(answers.linear.states?.groom || ['Todo']).join('+')}`);
		parts.push(`build=${(answers.linear.states?.build || ['Building']).join('+')}`);
	}
	if (answers.validation) parts.push(`validation=${answers.validation}`);
	return parts.join(', ');
}

function printNextSteps(answers) {
	const lines = ['', 'Done.', ''];

	// Always-relevant next steps.
	lines.push('  1. Review .autoship/standards.yaml. Inferred fields carry `# inferred from <evidence>` comments; SET_ME fields are your call. Edit directly — autoship does not modify it once it exists. Re-run `autoship init` later for an advisory if repo evidence has changed.');

	if (!answers || answers.tracker === 'skip') {
		lines.push('  2. (Optional) Open .autoship/defaults.yaml and uncomment the sections that match your setup — Linear or folder source, states, and validation command. Flags on the invocation always win.');
	}

	if (answers && answers.tracker === 'linear') {
		const groomStates = (answers.linear?.states?.groom || ['Todo']).join(' / ');
		const buildStates = (answers.linear?.states?.build || ['Spec Ready']).join(' / ');
		lines.push(`  2. In Linear, create two new workflow states (Settings → Workflow → Add status):`);
		lines.push(`       • "Spec Ready"      (type: unstarted, position between Todo and In Progress)`);
		lines.push(`       • "Needs Attention" (type: unstarted, parallel column)`);
		lines.push(`     These carry the "your turn" baton: autoship moves issues into them when grooming completes or a blocker fires.`);
		lines.push(`  3. Assign issues to yourself and put them in ${groomStates} when ready for autoship to groom. ${buildStates} is the build-eligible state autoship transitions to after the spec is reviewed.`);
	}

	lines.push('');
	lines.push('  Run autoship:');
	lines.push('');
	lines.push('       autoship audit --report-only      # zero-config, no tracker writes');
	if (answers && answers.tracker === 'linear') {
		lines.push('       autoship "get all Todo issues assigned to me and start grooming"');
		lines.push('       autoship deliver FRD-162          # approve the spec and build one issue');
	} else if (answers && answers.tracker === 'folder') {
		lines.push('       autoship groom FRD-162            # writes .autoship/issues/<id>/spec.md');
		lines.push('       autoship deliver FRD-162          # approve the spec and build one issue');
	}
	lines.push('       autoship interactive              # open a chat session with the controller');
	lines.push('');
	lines.push('  If you ran via `npx`, install globally to drop the prefix:');
	lines.push('       npm install -g @cs-calibrax/autoship');
	lines.push('');
	lines.push('  Docs: https://github.com/Calibrax-ai/autoship');
	lines.push('');

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

function renderDefaults(answers = null) {
	if (!answers) return renderDefaultsTemplate();
	return renderDefaultsConfigured(answers);
}

function renderDefaultsTemplate() {
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
#   # Set to false to skip the "Proceed? [y/N]" prompt on query/batch runs.
#   # The preview is still shown — autoship just doesn't pause for input.
#   # The per-run --yes flag has the same effect for one run.
#   confirm: true
#
#   # Pick exactly one source block: folder OR linear.
#   folder:
#     path: .autoship/issues
#
#   # linear:
#   #   team: "Delivery"
#   #   team_key: "DEL"          # Linear short key, used by the linear CLI
#   #   project: "MyProject"     # optional; omit for team-wide selection
#   #   owner: me                # "me" means the authenticated Linear user
#   #   states:
#   #     # Eligibility (which Linear states autoship picks up from)
#   #     groom: ["Todo"]
#   #     build: ["Spec Ready"]
#   #     # Transitions (which states autoship sets at handoffs)
#   #     # State changes are best-effort: missing target states fall back to comment-only.
#   #     working: "In Progress"      # autoship has the baton (grooming or building)
#   #     spec_ready: "Spec Ready"    # grooming complete, awaiting human approval
#   #     blocked: "Needs Attention"  # autoship halted, awaiting human unblock
#   #     pr_open: "In Review"        # draft PR opened, awaiting code review
#
#   validation:
#     commands:
#       - "bun test"
`;
}

function renderDefaultsConfigured(answers) {
	const lines = [];
	lines.push('# autoship defaults.yaml — per-repo sticky run defaults.');
	lines.push("# Generated by `autoship init`. Edit freely — autoship does not modify");
	lines.push('# this file once it exists. Flags on the invocation always win;');
	lines.push('# --report-only and --tracker=none override audit stickies.');
	lines.push('#');
	lines.push('# Safety note: keep audit.create_issues: false unless you actually want');
	lines.push('# every audit run to write into the tracker. Use --approve per-run instead.');
	lines.push('');

	// Audit block — always include with conservative defaults.
	const auditTracker = answers.tracker === 'linear' ? 'linear' : 'none';
	lines.push('audit:');
	lines.push(`  tracker: ${auditTracker}            # linear | none`);
	lines.push('  create_issues: false       # override per-run with --approve');
	lines.push('  external_exposure: false   # override per-run with --external-url=<url>');
	lines.push('');

	const deliverSource = answers.tracker === 'skip' ? null : answers.tracker;
	if (deliverSource) {
		lines.push('deliver:');
		lines.push('  # Set to false to skip the "Proceed? [y/N]" prompt on query/batch runs.');
		lines.push('  # The preview is still shown; autoship just does not pause for input.');
		lines.push('  # The per-run --yes flag has the same effect for one run.');
		lines.push('  confirm: true');
		lines.push('');
		if (deliverSource === 'linear' && answers.linear) {
			lines.push('  linear:');
			lines.push(`    team: ${quote(answers.linear.team)}`);
			if (answers.linear.teamKey) {
				lines.push(`    team_key: ${quote(answers.linear.teamKey)}    # Linear short key, used by the linear CLI`);
			}
			if (answers.linear.project) {
				lines.push(`    project: ${quote(answers.linear.project)}`);
			}
			lines.push(`    owner: ${answers.linear.owner || 'me'}`);
			lines.push('    states:');
			lines.push('      # Eligibility (which Linear states autoship picks up from)');
			lines.push(`      groom: [${(answers.linear.states?.groom || ['Todo']).map(quote).join(', ')}]`);
			lines.push(`      build: [${(answers.linear.states?.build || ['Spec Ready']).map(quote).join(', ')}]`);
			lines.push('      # Transitions (which states autoship sets at handoffs).');
			lines.push('      # Best-effort — if a target state does not exist in the workspace,');
			lines.push('      # autoship falls back to comment-only at that handoff.');
			lines.push('      working: "In Progress"      # autoship has the baton (grooming or building)');
			lines.push('      spec_ready: "Spec Ready"    # grooming complete, awaiting human approval');
			lines.push('      blocked: "Needs Attention"  # autoship halted, awaiting human unblock');
			lines.push('      pr_open: "In Review"        # draft PR opened, awaiting code review');
		} else {
			lines.push('  folder:');
			lines.push('    path: .autoship/issues');
		}
		lines.push('  validation:');
		lines.push('    commands:');
		if (answers.validation) {
			lines.push(`      - ${quote(answers.validation)}`);
		} else {
			lines.push("      # - \"bun test\"  # set this before running deliver");
		}
	} else {
		lines.push('# deliver:');
		lines.push('#   folder:');
		lines.push('#     path: .autoship/issues');
		lines.push('#   validation:');
		lines.push('#     commands:');
		lines.push('#       - "bun test"');
	}
	lines.push('');

	return lines.join('\n');
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
