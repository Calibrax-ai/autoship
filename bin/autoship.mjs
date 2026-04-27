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
  autoship audit [args...]             Run audit via the controller (e.g. --report-only, --approve)
  autoship deliver [args...]           Run deliver via the controller (e.g. FRD-162, "groom FRD-162")
  autoship interactive                 Open an interactive controller chat session

All audit/deliver commands forward args to the controller verbatim.
Set AUTOSHIP_PRINT=1 to see the underlying \`claude\` invocation without running it.

Examples:
  autoship audit --report-only
  autoship audit --tracker=linear --approve
  autoship deliver
  autoship deliver FRD-162
  autoship deliver groom FRD-162
  autoship deliver build FRD-162 --dry-run

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

async function spawnController({ prompt, interactive = false }) {
	const claudePath = which('claude');
	if (!claudePath) {
		fallbackGuidance(prompt.split(' ', 1)[0], prompt);
		return;
	}

	const argv = ['--agent', 'autoship-controller'];
	if (!interactive) argv.push('-p', prompt);

	if (process.env.AUTOSHIP_PRINT === '1') {
		const display = argv.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
		console.log(`${claudePath} ${display}`);
		return;
	}

	const child = spawn(claudePath, argv, { stdio: 'inherit' });
	await new Promise((resolve, reject) => {
		child.on('exit', (code) => {
			if (code === 0 || code === null) resolve();
			else process.exit(code);
		});
		child.on('error', reject);
	});
}

async function runAudit(args = []) {
	const prompt = buildPrompt('audit', args);
	await spawnController({ prompt });
}

async function runDeliver(args = []) {
	const prompt = buildPrompt('deliver', args);
	await spawnController({ prompt });
}

async function runInteractive() {
	const claudePath = which('claude');
	if (!claudePath) {
		console.log('\n`claude` is not on your PATH. Install Claude Code: https://claude.com/claude-code\n');
		process.exit(1);
	}
	const child = spawn(claudePath, ['--agent', 'autoship-controller'], { stdio: 'inherit' });
	await new Promise((resolve, reject) => {
		child.on('exit', (code) => {
			if (code === 0 || code === null) resolve();
			else process.exit(code);
		});
		child.on('error', reject);
	});
}

const commands = {
	init,
	audit: runAudit,
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
	printHelp();
	if (command) {
		console.error(`\nUnknown command: ${command}\n`);
		process.exit(1);
	}
}
