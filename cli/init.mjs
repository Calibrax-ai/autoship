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

export async function init() {
	const cwd = process.cwd();

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

	// Copy agents + skills (everything under .claude/)
	copyDir(join(PKG_ROOT, '.claude'), join(cwd, '.claude'));
	console.log('  ✓ agents → .claude/agents/');
	console.log('  ✓ skills → .claude/skills/');

	// Create .autoship/
	const autoshipDir = join(cwd, '.autoship');
	mkdirSync(autoshipDir, { recursive: true });

	// Copy teach-autoship.md
	const teachSrc = join(PKG_ROOT, 'teach-autoship.md');
	if (existsSync(teachSrc)) {
		copyFileSync(teachSrc, join(autoshipDir, 'teach-autoship.md'));
		console.log('  ✓ teach-autoship.md → .autoship/');
	}

	// Write program.md
	const programContent = renderProgram({
		tracker,
		trackerConfig,
		approvalMode,
		validationCmd,
	});
	writeFileSync(join(autoshipDir, 'program.md'), programContent);
	console.log('  ✓ program.md → .autoship/');

	// Update .gitignore
	updateGitignore(cwd);
	console.log('  ✓ .gitignore updated');

	console.log(`
Done. Next steps:

  1. Review .autoship/program.md and adjust any details.${
		tracker === 'linear'
			? '\n  2. Install the Linear MCP: https://docs.anthropic.com/en/docs/mcp'
			: ''
	}
  ${tracker === 'linear' ? 3 : 2}. From this directory, run:

       claude --agent controller -p "deliver"

  Docs: https://github.com/Calibrax-ai/autoship
`);
}

function copyDir(src, dest) {
	if (!existsSync(src)) return;
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
