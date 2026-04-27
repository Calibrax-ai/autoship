#!/usr/bin/env node
import { init } from '../cli/init.mjs';

const command = process.argv[2];

function printHelp() {
	console.log(`
autoship — turn messy software work into reviewable, reliable delivery

Usage:
  autoship init                        Install core autoship agents into the current repo
  autoship init --with-extract         Also install optional extract research agents
  autoship standards                   Print standards drafting guidance
  autoship audit                       Print audit invocation guidance
  autoship deliver                     Print deliver invocation guidance

Running autoship (until v0.3.0 lands a native CLI, use the controller agent directly):

  claude --agent autoship-controller -p "draft standards from this repo"
  claude --agent autoship-controller -p "audit --report-only"

Deliver needs an issue source plus validation.commands first:

  claude --agent autoship-controller -p "deliver FRD-162"

Docs: https://github.com/Calibrax-ai/autoship
`);
}

function printAuditGuidance() {
	console.log(`
'autoship audit' is a CLI stub. A native wrapper is scheduled for v0.3.0.
Until then, invoke the controller agent directly:

  # report-only, no tracker writes
  claude --agent autoship-controller -p "audit --report-only"

  # write approved issues to Linear
  claude --agent autoship-controller -p "audit --tracker=linear --approve"

  # natural-language prompt
  claude --agent autoship-controller -p "audit this repo, report-only"

Accepted flags (resolved by the controller into a RunRequest):
  --report-only              No tracker writes (overrides defaults.yaml)
  --tracker=<source>         linear | none
  --approve                  Create approved issue candidates in Backlog
  --external-url=<url>       Enable safe black-box probes against this URL

Precedence: flags > .autoship/defaults.yaml > framework defaults.
Framework defaults are conservative: tracker=none, create_issues=false, external_exposure=false.

See .claude/agents/autoship-controller.md § How I Receive Work for the full contract.
`);
}

function printStandardsGuidance() {
	console.log(`
'autoship standards' is a CLI stub. A native wrapper is scheduled for v0.3.0.
Until then, invoke the controller agent directly:

  claude --agent autoship-controller -p "draft standards from this repo"

The controller inspects repo evidence and fills .autoship/standards.yaml where confidence is high.
Uncertain policy remains SET_ME with short inline comments. Existing non-SET_ME values are not overwritten silently.
`);
}

function printDeliverGuidance() {
	console.log(`
'autoship deliver' is a CLI stub. A native wrapper is scheduled for v0.3.0.
Until then, invoke the controller agent directly:

  # first configure an issue source + validation command:
  #   - uncomment deliver.tracker + deliver.validation in .autoship/defaults.yaml, or
  #   - create .autoship/issues/<id>/issue.md for folder/local mode and uncomment deliver.validation
  #
  # resume any in-flight work
  claude --agent autoship-controller -p "deliver"

  # one issue
  claude --agent autoship-controller -p "deliver FRD-162"

  # force groom phase
  claude --agent autoship-controller -p "deliver groom FRD-162"

  # plan the build but don't push or open a PR
  claude --agent autoship-controller -p "deliver build FRD-162 --dry-run"

  # natural-language prompt
  claude --agent autoship-controller -p "groom FRD-162"

Precedence: flags > .autoship/defaults.yaml > framework defaults.
Framework defaults: tracker=folder, folder.path=.autoship/issues, worktree.root=.autoship/worktrees, branch_prefix=autoship/, draft PR to origin/main, dry_run=false, approval_mode=supervised.
Build requires validation.commands; Linear requires team/project.

See .claude/agents/autoship-controller.md § How I Receive Work for the full contract.
`);
}

const commands = {
	init,
	standards: printStandardsGuidance,
	audit: printAuditGuidance,
	deliver: printDeliverGuidance,
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
