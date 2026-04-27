// Helpers for driving the `linear` CLI from the autoship init wizard.
//
// Used to discover real Linear teams, projects, and labels so the wizard can
// present them as picklists (no typos, no manual entry). All calls are sync
// (~200-500ms each) — acceptable for a one-time setup flow.
//
// Each helper returns null on failure rather than throwing, so the wizard can
// fall back to manual entry gracefully when:
//   - `linear` CLI isn't installed
//   - User isn't logged in
//   - Network/API failure
//   - Output format changes (CLI version skew)

import { execSync } from 'node:child_process';

export function checkLinearCli() {
	try {
		const path = execSync('command -v linear', {
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		return path || null;
	} catch {
		return null;
	}
}

export function checkLinearAuth() {
	try {
		const out = execSync('linear auth whoami 2>&1', { encoding: 'utf-8', timeout: 5000 });
		// On success, output looks like: `WORKSPACE/USER ...`. On not-logged-in,
		// it errors. Anything that didn't throw is good enough.
		return stripAnsi(out).trim().length > 0;
	} catch {
		return false;
	}
}

// `linear team list` doesn't support --json, so we use the GraphQL `api`
// subcommand for a structured answer.
export function listTeams() {
	try {
		const query = '{ teams { nodes { id key name } } }';
		const out = execSync(`linear api '${query}'`, { encoding: 'utf-8', timeout: 10000 });
		const parsed = JSON.parse(out);
		const nodes = parsed?.data?.teams?.nodes ?? parsed?.teams?.nodes ?? [];
		return nodes.map((n) => ({ id: n.id, key: n.key, name: n.name }));
	} catch {
		return null;
	}
}

export function listProjects(teamKey) {
	try {
		const out = execSync(`linear project list --team ${shellEscape(teamKey)} --json 2>/dev/null`, {
			encoding: 'utf-8',
			timeout: 10000,
		});
		const arr = JSON.parse(out);
		return arr.map((p) => ({ id: p.id, name: p.name, slug: p.slugId ?? p.slug }));
	} catch {
		return null;
	}
}

export function listLabels(teamKey) {
	try {
		// --all to surface workspace + team-specific labels; the team's
		// effective label set includes both.
		const out = execSync(`linear label list --team ${shellEscape(teamKey)} --all --json 2>/dev/null`, {
			encoding: 'utf-8',
			timeout: 10000,
		});
		const arr = JSON.parse(out);
		return arr.map((l) => ({ id: l.id, name: l.name }));
	} catch {
		// Fall back to team-only if --all isn't supported by this CLI version.
		try {
			const out = execSync(`linear label list --team ${shellEscape(teamKey)} --json 2>/dev/null`, {
				encoding: 'utf-8',
				timeout: 10000,
			});
			const arr = JSON.parse(out);
			return arr.map((l) => ({ id: l.id, name: l.name }));
		} catch {
			return null;
		}
	}
}

// Linear's workflow state types are universal across workspaces — they
// describe the phase of the issue, not the team-specific state name.
// (Real state names like "Todo", "In Review" map to one of these types.)
export const LINEAR_STATE_TYPES = [
	{ value: 'triage', label: 'triage  (newly filed, awaiting routing)' },
	{ value: 'backlog', label: 'backlog  (acknowledged, not yet prioritized)' },
	{ value: 'unstarted', label: 'unstarted  (Todo / ready to start)' },
	{ value: 'started', label: 'started  (In Progress)' },
	{ value: 'completed', label: 'completed  (Done / Shipped)' },
	{ value: 'canceled', label: 'canceled' },
];

function stripAnsi(s) {
	return s.replace(/\x1b\[[0-9;]*[mK]/g, '');
}

function shellEscape(s) {
	// Conservative — only allow alphanumeric + `-` + `_`. Anything else => quote.
	if (/^[A-Za-z0-9_\-]+$/.test(s)) return s;
	return `'${String(s).replace(/'/g, "'\\''")}'`;
}
