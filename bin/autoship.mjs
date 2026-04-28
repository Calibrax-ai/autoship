#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';

import { init } from '../cli/init.mjs';

const command = process.argv[2];

function printHelp() {
	console.log(`
autoship — turn messy software work into reviewable, reliable delivery

Usage:
  autoship init                        Install + interactively configure autoship in this repo
  autoship init --no-interactive       Skip the wizard; writes the commented template
  autoship "<prompt>"                  Run a natural-language request through the controller
  autoship audit [args...]             Run audit via the controller (interactive — output streams)
  autoship groom [scope...]            Groom issues and write local specs
  autoship deliver [args...]           Run deliver via the controller (interactive — output streams)
  autoship interactive                 Open an interactive controller chat with no starting prompt

Prompt/audit/groom/deliver default to INTERACTIVE mode — output streams as the
controller runs, session stays open for follow-ups. Add --print for headless
mode (final response only; useful for CI / pipes).

Set AUTOSHIP_PRINT=1 to see the resolved \`claude\` invocation without running it.

Examples:
  autoship "get all Todo issues assigned to me and start grooming"
  autoship audit --report-only             # interactive: stream output, stay open
  autoship audit --report-only --print     # headless: print final response only
  autoship groom mine --state Todo --yes   # batch groom after explicit confirmation skip
  autoship groom FRD-162 --post            # groom locally, then mirror summary to Linear
  autoship deliver FRD-162                 # approve current spec and build one issue
  autoship deliver build FRD-162 --dry-run # plan/build path, no push/PR

Docs: https://github.com/Calibrax-ai/autoship
`);
}

function which(bin) {
	try {
		const path = execSync(`command -v ${bin}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		return path || null;
	} catch {
		return null;
	}
}

function buildPrompt(mode, args) {
	if (!args.length) return mode;
	return `${mode} ${args.join(' ')}`;
}

function fallbackGuidance(mode, prompt) {
	const cmd = `claude --agent autoship-controller -p "${prompt}"`;
	console.log(`\n\`claude\` is not on your PATH, so autoship can't run the controller for you.\n`);
	console.log(`Install Claude Code (https://claude.com/claude-code), then run:\n`);
	console.log(`  ${cmd}\n`);
	console.log(`(Set AUTOSHIP_PRINT=1 to print this command without trying to run it.)\n`);
	process.exit(1);
}

// Modes:
//   interactive (default): `claude --agent X "<prompt>"` — opens an
//     interactive session with the prompt as the first user message. Output
//     streams to the terminal as Claude generates. Session stays open after
//     the controller finishes so the user can ask follow-ups.
//   headless: `claude --agent X -p "<prompt>"` — runs and prints the final
//     response only. Useful for CI / pipes / scripting. Triggered by
//     --print flag.
async function spawnController({ prompt, mode = 'interactive' }) {
	const claudePath = which('claude');
	if (process.env.AUTOSHIP_PRINT === '1') {
		const displayPath = claudePath || 'claude';
		const argv = ['--agent', 'autoship-controller'];
		if (mode === 'headless') {
			argv.push('-p', prompt);
		} else if (mode === 'interactive' && prompt) {
			argv.push(prompt);
		}
		const display = argv.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
		console.log(`${displayPath} ${display}`);
		return;
	}

	if (!claudePath) {
		fallbackGuidance(prompt.split(' ', 1)[0], prompt);
		return;
	}

	const argv = ['--agent', 'autoship-controller'];
	if (mode === 'headless') {
		argv.push('-p', prompt);
	} else if (mode === 'interactive') {
		// Pass the prompt as a positional argument; claude opens an interactive
		// session with this as the first message.
		if (prompt) argv.push(prompt);
	}
	// mode === 'open' → no prompt, just open the session

	const child = spawn(claudePath, argv, { stdio: 'inherit' });
	await new Promise((resolve, reject) => {
		child.on('exit', (code) => {
			if (code === 0 || code === null) resolve();
			else process.exit(code);
		});
		child.on('error', reject);
	});
}

// Splits args into (forwarded-to-controller-prompt) and (autoship-side flags).
function splitArgs(args) {
	const forwarded = [];
	const flags = { print: false };
	for (const a of args) {
		if (a === '--print') flags.print = true;
		else forwarded.push(a);
	}
	return { forwarded, flags };
}

async function runAudit(args = []) {
	const { forwarded, flags } = splitArgs(args);
	const prompt = buildPrompt('audit', forwarded);
	await spawnController({ prompt, mode: flags.print ? 'headless' : 'interactive' });
}

async function runDeliver(args = []) {
	const { forwarded, flags } = splitArgs(args);
	const prompt = buildPrompt('deliver', forwarded);
	await spawnController({ prompt, mode: flags.print ? 'headless' : 'interactive' });
}

async function runGroom(args = []) {
	const { forwarded, flags } = splitArgs(args);
	const prompt = buildPrompt('groom', forwarded);
	await spawnController({ prompt, mode: flags.print ? 'headless' : 'interactive' });
}

async function runPrompt(args = []) {
	const { forwarded, flags } = splitArgs(args);
	const prompt = forwarded.join(' ');
	await spawnController({ prompt, mode: flags.print ? 'headless' : 'interactive' });
}

async function runInteractive() {
	await spawnController({ prompt: '', mode: 'open' });
}

const commands = {
	init,
	audit: runAudit,
	groom: runGroom,
	deliver: runDeliver,
	interactive: runInteractive,
	help: printHelp,
	'--help': printHelp,
	'-h': printHelp,
};

const handler = commands[command];

if (handler) {
	try {
		await handler(process.argv.slice(3));
	} catch (err) {
		console.error(`\n${err.message}\n`);
		process.exit(1);
	}
} else {
	if (command) {
		try {
			await runPrompt(process.argv.slice(2));
		} catch (err) {
			console.error(`\n${err.message}\n`);
			process.exit(1);
		}
	} else {
		printHelp();
	}
}
