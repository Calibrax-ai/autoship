import { defineConfig } from "@trigger.dev/sdk";
import { aptGet } from "@trigger.dev/build/extensions/core";
import type { BuildExtension } from "@trigger.dev/build";

/**
 * Custom build extension that npm-installs a CLI globally into the deployed
 * worker image. Mirrors the documented Cursor-CLI recipe in trigger.dev's
 * docs (https://trigger.dev/docs/config/extensions/custom). Uses
 * `image.instructions` because that targets the FINAL image stage —
 * `commands` runs in the build stage and doesn't persist to runtime.
 *
 * No-ops in dev (`trigger dev`) so local iteration doesn't pay the install
 * cost on every restart.
 */
function npmGlobalCli(packageSpec: string): BuildExtension {
  return {
    name: `npm-global-${packageSpec.replaceAll(/[^a-z0-9]+/gi, "-")}`,
    onBuildComplete(context) {
      if (context.target === "dev") return;
      context.addLayer({
        id: `npm-global-${packageSpec.replaceAll(/[^a-z0-9]+/gi, "-")}`,
        image: {
          instructions: [`RUN npm install -g ${packageSpec}`],
        },
      });
    },
  };
}

/**
 * Install vercel-labs/agent-browser plus the Chrome-for-Testing binary it
 * drives. Replaces the previous `playwright` extension after KOO-70 OOMs
 * on medium-1x: agent-browser uses a persistent Rust daemon + single shared
 * browser instance with idle-shutdown via AGENT_BROWSER_IDLE_TIMEOUT_MS,
 * vs Playwright's per-invocation Node + Chromium pattern that stacked
 * 500-700MB per active capture. Same `--with-deps` pattern Playwright
 * uses for system libs; sudo is fine here because build extensions run
 * as root at image build time, not at runtime.
 */
function agentBrowserInstall(packageSpec: string): BuildExtension {
  return {
    name: `agent-browser-${packageSpec.replaceAll(/[^a-z0-9]+/gi, "-")}`,
    onBuildComplete(context) {
      if (context.target === "dev") return;
      context.addLayer({
        id: `agent-browser-${packageSpec.replaceAll(/[^a-z0-9]+/gi, "-")}`,
        image: {
          instructions: [
            `RUN npm install -g ${packageSpec}`,
            "RUN agent-browser install --with-deps",
          ],
        },
      });
    },
  };
}

export default defineConfig({
  // Project ref is a non-secret identifier (like a Vercel project ID), so
  // it's hardcoded for deterministic CI deploys. Auth is via the access
  // token (CLI: TRIGGER_ACCESS_TOKEN) and the runtime secret key (worker:
  // TRIGGER_SECRET_KEY) — those stay in env / Secret Manager.
  project: "proj_oxsihjcdaqkiwfkvtnbt",
  runtime: "node-22",
  dirs: ["./src/trigger"],
  // Trigger.dev's default worker image is slim Node. Runner shells out to
  // `git` (src/runner/git.ts), `gh` (controller PR handoff), `claude`
  // (src/runner/autoship.ts), and `agent-browser` (visual evidence
  // capture for frontend slices).
  // - aptGet: system packages from Debian repos.
  // - npmGlobalCli: bake an npm CLI into the deployed image so its bin
  //   lands on PATH at /usr/local/bin and a bare-name spawn finds it
  //   without the per-cold-start npx download tax.
  // - agentBrowserInstall: vercel-labs/agent-browser CLI + Chrome-for-
  //   Testing binary + system libs. Replaces the prior Playwright
  //   extension after KOO-70 OOMs on medium-1x (run_cmp3vnbl3000v0hmv5jxys7mr).
  //   agent-browser's persistent Rust daemon + single shared browser is
  //   far lighter than Playwright's per-invocation Node+Chromium model.
  //
  // Pinned exactly (no ^/~) so every rebuild ships the same versions.
  // Reproducible builds matter when debugging — a deploy in June
  // shouldn't silently pick up Claude Code changes that landed in May.
  // Bump deliberately by editing the string and re-deploying.
  build: {
    extensions: [
      aptGet({ packages: ["git", "gh"] }),
      npmGlobalCli("@anthropic-ai/claude-code@2.1.126"),
      npmGlobalCli("bun@1.3.13"),
      agentBrowserInstall("agent-browser@0.27.0"),
    ],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 5_000,
      maxTimeoutInMs: 60_000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 14_400,
});
