#!/usr/bin/env node
import { init } from '../cli/init.mjs';

const command = process.argv[2];

function printHelp() {
	console.log(`
autoship — turn messy software work into reviewable, reliable delivery

Usage:
  autoship init                 Install core autoship agents into the current repo
  autoship init --with-extract  Also install optional extract research agents

Docs: https://github.com/Calibrax-ai/autoship
`);
}

const commands = {
	init,
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
