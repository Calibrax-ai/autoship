// Helpers for driving the `linear` CLI from the autoship init wizard.
//
// Used to discover real Linear teams and projects so the wizard can
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

function stripAnsi(s) {
	return s.replace(/\x1b\[[0-9;]*[mK]/g, '');
}

function shellEscape(s) {
	// Conservative — only allow alphanumeric + `-` + `_`. Anything else => quote.
	if (/^[A-Za-z0-9_\-]+$/.test(s)) return s;
	return `'${String(s).replace(/'/g, "'\\''")}'`;
}
