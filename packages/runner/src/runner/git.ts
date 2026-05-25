import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { logger } from "@trigger.dev/sdk";
import type { AutoshipRunPayload } from "../types.js";
import { runCommand, type CommandResult } from "./process.js";

type GitIdentity = {
  name: string;
  email: string;
  source: "env" | "github-token";
};

type GitHubUser = {
  id: number;
  login: string;
  name?: string | null;
};

/**
 * Surface non-zero git exits as thrown errors carrying stderr. Without this,
 * `runCommand` resolves on non-zero exit and the caller silently proceeds —
 * which previously masked auth/network failures behind a downstream
 * `spawn git ENOENT` (cwd-missing) on the next step.
 */
async function runGitOrThrow(args: {
  command: string;
  args: string[];
  cwd: string;
}): Promise<CommandResult> {
  const result = await runCommand(args);
  if (result.exitCode !== 0) {
    const stderrTail = result.stderr.trim().split("\n").slice(-5).join(" | ");
    throw new Error(
      `git exited ${result.exitCode}: ${args.command} ${args.args.join(" ")} — ${stderrTail || "(no stderr)"}`,
    );
  }
  return result;
}

export function readGitIdentityFromEnv(env: NodeJS.ProcessEnv = process.env): GitIdentity | undefined {
  const name = env.AUTOSHIP_GIT_AUTHOR_NAME?.trim();
  const email = env.AUTOSHIP_GIT_AUTHOR_EMAIL?.trim();

  if (!name && !email) return undefined;
  if (!name || !email) {
    throw new Error("Set both AUTOSHIP_GIT_AUTHOR_NAME and AUTOSHIP_GIT_AUTHOR_EMAIL, or neither.");
  }

  return { name, email, source: "env" };
}

export function deriveGitIdentityFromGitHubUser(user: GitHubUser): GitIdentity {
  return {
    name: user.name?.trim() || user.login,
    email: `${user.id}+${user.login}@users.noreply.github.com`,
    source: "github-token",
  };
}

export function gitIdentityEnv(identity: GitIdentity | undefined): NodeJS.ProcessEnv | undefined {
  if (!identity) return undefined;
  return {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "autoship-runner",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub user lookup failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as Partial<GitHubUser>;
  if (typeof body.id !== "number" || typeof body.login !== "string" || body.login.length === 0) {
    throw new Error("GitHub user lookup returned an invalid user payload.");
  }

  return {
    id: body.id,
    login: body.login,
    name: typeof body.name === "string" ? body.name : null,
  };
}

async function resolveGitIdentity(token: string): Promise<GitIdentity> {
  const envIdentity = readGitIdentityFromEnv();
  if (envIdentity) return envIdentity;

  return deriveGitIdentityFromGitHubUser(await fetchGitHubUser(token));
}

/**
 * Wires git to authenticate with GitHub via GH_TOKEN (or GITHUB_TOKEN).
 *
 * Uses the credential.helper store pattern: the token lives in
 * ~/.git-credentials at mode 0600 and never appears as a process arg, so
 * it does not leak into runCommand's renderedCommand string (which gets
 * surfaced in span attributes and the AutoshipRunResult posted to Linear).
 *
 * No-op when neither env var is set — keeps local dev runs against public
 * repos working without ceremony.
 */
async function configureGitAuth(reposRoot: string): Promise<GitIdentity | undefined> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const envIdentity = readGitIdentityFromEnv();
  if (!token) return envIdentity;

  // Trigger.dev workers don't always set HOME in env. Node's homedir()
  // falls back to /etc/passwd lookup so writeFile works, but git itself
  // checks the HOME env var directly and refuses --global with "fatal:
  // $HOME not set". Mirror homedir() into HOME so git, the credential
  // helper, and Node agree on the same path.
  process.env.HOME ??= homedir();
  const identity = envIdentity ?? (await resolveGitIdentity(token));

  await logger.trace("git: configure auth", async (span) => {
    span.setAttribute("git.auth_source", process.env.GH_TOKEN ? "GH_TOKEN" : "GITHUB_TOKEN");
    span.setAttribute("git.identity_source", identity.source);

    const credsPath = path.join(homedir(), ".git-credentials");
    await writeFile(credsPath, `https://x-access-token:${token}@github.com\n`, { mode: 0o600 });
    await runGitOrThrow({
      command: "git",
      args: ["config", "--global", "credential.helper", "store"],
      cwd: reposRoot,
    });
    await runGitOrThrow({
      command: "git",
      args: ["config", "--global", "user.name", identity.name],
      cwd: reposRoot,
    });
    await runGitOrThrow({
      command: "git",
      args: ["config", "--global", "user.email", identity.email],
      cwd: reposRoot,
    });
  });

  return identity;
}

async function configureRepoGitIdentity(repoPath: string, identity: GitIdentity | undefined): Promise<void> {
  if (!identity) return;

  await logger.trace("git: configure repo identity", async (span) => {
    span.setAttribute("git.identity_source", identity.source);
    await runGitOrThrow({
      command: "git",
      args: ["config", "user.name", identity.name],
      cwd: repoPath,
    });
    await runGitOrThrow({
      command: "git",
      args: ["config", "user.email", identity.email],
      cwd: repoPath,
    });
  });
}

export async function ensureRepoCheckout({
  reposRoot,
  payload,
}: {
  reposRoot: string;
  payload: AutoshipRunPayload;
}): Promise<string> {
  await logger.trace("git: ensure repos root", async (span) => {
    span.setAttribute("git.repos_root", reposRoot);
    await mkdir(reposRoot, { recursive: true });
  });

  const gitIdentity = await configureGitAuth(reposRoot);
  Object.assign(process.env, gitIdentityEnv(gitIdentity));

  const repoPath = path.resolve(reposRoot, payload.repo.fullName.replaceAll("/", "__"));

  try {
    await logger.trace("git: check existing checkout", async (span) => {
      span.setAttribute("git.checkout_path", repoPath);
      await runGitOrThrow({
        command: "git",
        args: ["rev-parse", "--is-inside-work-tree"],
        cwd: repoPath,
      });
    });
  } catch {
    await logger.trace("git: clone repository", async (span) => {
      span.setAttribute("git.repository", payload.repo.fullName);
      span.setAttribute("git.checkout_path", repoPath);
      await runGitOrThrow({
        command: "git",
        args: ["clone", payload.repo.cloneUrl, repoPath],
        cwd: reposRoot,
      });
    });
  }

  await configureRepoGitIdentity(repoPath, gitIdentity);

  await logger.trace("git: fetch default branch", async (span) => {
    span.setAttribute("git.branch", payload.repo.defaultBranch);
    await runGitOrThrow({
      command: "git",
      args: ["fetch", "origin", payload.repo.defaultBranch],
      cwd: repoPath,
    });
  });

  await logger.trace("git: checkout default branch", async (span) => {
    span.setAttribute("git.branch", payload.repo.defaultBranch);
    await runGitOrThrow({
      command: "git",
      args: ["checkout", payload.repo.defaultBranch],
      cwd: repoPath,
    });
  });

  await logger.trace("git: pull default branch", async (span) => {
    span.setAttribute("git.branch", payload.repo.defaultBranch);
    await runGitOrThrow({
      command: "git",
      args: ["pull", "--ff-only", "origin", payload.repo.defaultBranch],
      cwd: repoPath,
    });
  });

  return repoPath;
}
