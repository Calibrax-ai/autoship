// Infer high-confidence standards.yaml values from repo evidence.
//
// Used by `autoship init`:
//   - On a fresh install: seed standards.yaml with values we can detect
//   - Re-run on an existing .autoship/: produce an advisory of fills + conflicts
//     (informational only, never written to disk)
//
// Rules:
//   - First match wins per field. Order rules from most-specific to least.
//   - Never write a value from absence of evidence (no `provider: none` because
//     `.github/workflows/` is missing — could be Buildkite, GitLab, etc.).
//   - Judgment calls (latency budgets, isolation requirements, role models)
//     stay SET_ME regardless. Inference is for mechanical pattern-matches.
//   - Root-level only — workspace/monorepo walk is a v2 problem.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function inferStandards(repoRoot) {
	const values = {};
	const evidence = {};

	const pkg = readJSON(join(repoRoot, 'package.json'));
	const npmDeps = collectNpmDeps(pkg);
	const pyText =
		readText(join(repoRoot, 'pyproject.toml')) +
		'\n' +
		readText(join(repoRoot, 'requirements.txt'));
	const pyDeps = collectPyDeps(pyText);

	// platform.hosting — explicit platform marker beats framework hint
	if (existsSync(join(repoRoot, 'vercel.json'))) {
		set(values, evidence, 'platform.hosting', 'vercel', 'vercel.json');
	} else if (npmDeps.has('next')) {
		set(values, evidence, 'platform.hosting', 'vercel', 'package.json:next');
	} else if (existsSync(join(repoRoot, 'fly.toml'))) {
		set(values, evidence, 'platform.hosting', 'fly.io', 'fly.toml');
	} else if (existsSync(join(repoRoot, 'wrangler.toml'))) {
		set(values, evidence, 'platform.hosting', 'cloudflare-workers', 'wrangler.toml');
	} else if (existsSync(join(repoRoot, 'Dockerfile'))) {
		set(values, evidence, 'platform.hosting', 'container', 'Dockerfile');
	}

	// ci.provider
	if (hasGithubWorkflows(repoRoot)) {
		set(values, evidence, 'ci.provider', 'github-actions', '.github/workflows/');
	} else if (existsSync(join(repoRoot, '.gitlab-ci.yml'))) {
		set(values, evidence, 'ci.provider', 'gitlab-ci', '.gitlab-ci.yml');
	} else if (existsSync(join(repoRoot, '.circleci', 'config.yml'))) {
		set(values, evidence, 'ci.provider', 'circleci', '.circleci/config.yml');
	}

	// ci.required_checks — derive from package.json scripts
	if (pkg && pkg.scripts && typeof pkg.scripts === 'object') {
		const scripts = Object.keys(pkg.scripts);
		const candidates = ['lint', 'test', 'typecheck', 'build'];
		const present = candidates.filter((s) => scripts.includes(s));
		if (present.length > 0) {
			set(values, evidence, 'ci.required_checks', present, 'package.json:scripts');
		}
	}

	// database.migrations
	if (existsSync(join(repoRoot, 'prisma', 'schema.prisma'))) {
		set(values, evidence, 'database.migrations', 'prisma migrate', 'prisma/schema.prisma');
	} else if (
		existsSync(join(repoRoot, 'drizzle.config.ts')) ||
		existsSync(join(repoRoot, 'drizzle.config.js'))
	) {
		set(values, evidence, 'database.migrations', 'drizzle-kit', 'drizzle.config');
	} else if (existsSync(join(repoRoot, 'alembic.ini'))) {
		set(values, evidence, 'database.migrations', 'alembic', 'alembic.ini');
	}

	// observability.errors
	if (anyStartsWith(npmDeps, '@sentry/')) {
		set(values, evidence, 'observability.errors', 'sentry', 'package.json:@sentry/*');
	} else if (anyStartsWith(npmDeps, '@datadog/')) {
		set(values, evidence, 'observability.errors', 'datadog', 'package.json:@datadog/*');
	} else if (pyDeps.has('sentry-sdk')) {
		set(values, evidence, 'observability.errors', 'sentry', 'pyproject:sentry-sdk');
	}

	// observability.logs
	if (npmDeps.has('pino')) {
		set(values, evidence, 'observability.logs', 'pino', 'package.json:pino');
	} else if (npmDeps.has('winston')) {
		set(values, evidence, 'observability.logs', 'winston', 'package.json:winston');
	}

	// async.provider
	if (npmDeps.has('bullmq') || npmDeps.has('bull')) {
		set(values, evidence, 'async.provider', 'bullmq', 'package.json:bullmq');
	} else if (npmDeps.has('inngest')) {
		set(values, evidence, 'async.provider', 'inngest', 'package.json:inngest');
	} else if (pyDeps.has('celery')) {
		set(values, evidence, 'async.provider', 'celery', 'pyproject:celery');
	}

	// security.dependency_scan
	if (existsSync(join(repoRoot, '.github', 'dependabot.yml'))) {
		set(values, evidence, 'security.dependency_scan', 'dependabot', '.github/dependabot.yml');
	} else if (existsSync(join(repoRoot, 'renovate.json'))) {
		set(values, evidence, 'security.dependency_scan', 'renovate', 'renovate.json');
	}

	return { values, evidence };
}

// Walk a SET_ME standards.yaml template line-by-line, replacing inferred
// fields in place. Preserves indentation, replaces the trailing example
// comment with `# inferred from <evidence>`. Section-scoped: `provider`
// inside `ci:` is distinct from `provider` inside `async:`.
//
// Returns { yaml, filled, conflicts } so callers can also use this against
// an existing standards.yaml (where some fields may already have non-SET_ME
// values that conflict with inference — those go in `conflicts`, not `filled`).
export function applyInferences(yamlText, { values, evidence }) {
	const lines = yamlText.split('\n');
	let currentSection = null;
	const filled = [];
	const conflicts = [];
	const used = new Set();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const sectionMatch = line.match(/^([a-z_][a-z0-9_]*):\s*$/);
		if (sectionMatch) {
			currentSection = sectionMatch[1];
			continue;
		}
		if (!currentSection) continue;

		const fieldMatch = line.match(/^(\s+)([a-z_][a-z0-9_]*):\s*(.+?)(\s*#.*)?$/);
		if (!fieldMatch) continue;

		const [, indent, field, rawValue] = fieldMatch;
		const dotKey = `${currentSection}.${field}`;
		if (!(dotKey in values)) continue;

		const inferred = values[dotKey];
		const source = evidence[dotKey];
		const isPlaceholder = rawValue === '"SET_ME"' || rawValue === '[]';

		if (isPlaceholder) {
			lines[i] = `${indent}${field}: ${serializeYAML(inferred)}  # inferred from ${source}`;
			filled.push({ key: dotKey, value: inferred, source });
			used.add(dotKey);
		} else {
			const existing = parseYAMLScalar(rawValue);
			if (!valuesEqual(existing, inferred)) {
				conflicts.push({ key: dotKey, existing, inferred, source });
			}
			used.add(dotKey);
		}
	}

	// Inferences without a matching template line — log so we notice schema drift,
	// but don't error. Could happen if the standards schema gains a new field
	// before the inferer is updated, or vice versa.
	for (const key of Object.keys(values)) {
		if (!used.has(key)) {
			conflicts.push({
				key,
				existing: '(field not present in template)',
				inferred: values[key],
				source: evidence[key],
			});
		}
	}

	return { yaml: lines.join('\n'), filled, conflicts };
}

// ---- helpers ----

function set(values, evidence, key, value, source) {
	if (key in evidence) return; // first match wins
	values[key] = value;
	evidence[key] = source;
}

function readJSON(path) {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf-8'));
	} catch {
		return null;
	}
}

function readText(path) {
	if (!existsSync(path)) return '';
	try {
		return readFileSync(path, 'utf-8');
	} catch {
		return '';
	}
}

function collectNpmDeps(pkg) {
	const all = new Set();
	if (!pkg) return all;
	for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
		const block = pkg[k];
		if (block && typeof block === 'object') {
			for (const name of Object.keys(block)) all.add(name);
		}
	}
	return all;
}

function collectPyDeps(text) {
	const deps = new Set();
	if (!text) return deps;
	// Match common dep declaration patterns across pyproject.toml + requirements.txt:
	//   celery = "^5.3"          (poetry table)
	//   "celery" = "^5.3"        (poetry table, quoted)
	//   "celery>=5.3"            (pep 621 list entry)
	//   celery>=5.3              (requirements.txt)
	for (const m of text.matchAll(/(?:^|[\s,\[])"?([a-zA-Z][a-zA-Z0-9_\-]*)"?\s*[=>~<!]/gm)) {
		deps.add(m[1].toLowerCase());
	}
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const m = trimmed.match(/^([a-zA-Z][a-zA-Z0-9_\-]*)/);
		if (m) deps.add(m[1].toLowerCase());
	}
	return deps;
}

function hasGithubWorkflows(repoRoot) {
	const dir = join(repoRoot, '.github', 'workflows');
	if (!existsSync(dir)) return false;
	try {
		return readdirSync(dir).some((f) => /\.ya?ml$/.test(f));
	} catch {
		return false;
	}
}

function anyStartsWith(set, prefix) {
	for (const v of set) if (v.startsWith(prefix)) return true;
	return false;
}

function serializeYAML(value) {
	if (Array.isArray(value)) {
		return '[' + value.map((v) => JSON.stringify(v)).join(', ') + ']';
	}
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}
	if (typeof value === 'boolean' || typeof value === 'number') {
		return String(value);
	}
	return JSON.stringify(value);
}

function parseYAMLScalar(raw) {
	const trimmed = raw.trim();
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;
	if (trimmed === '[]') return [];
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		try {
			return JSON.parse(trimmed.replace(/'/g, '"'));
		} catch {
			return trimmed.slice(1, -1);
		}
	}
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		try {
			return JSON.parse(trimmed.replace(/'/g, '"'));
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}

function valuesEqual(a, b) {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((x, i) => x === b[i]);
	}
	return a === b;
}
