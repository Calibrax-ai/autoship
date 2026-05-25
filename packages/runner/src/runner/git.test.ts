import assert from "node:assert/strict";
import { deriveGitIdentityFromGitHubUser, gitIdentityEnv, readGitIdentityFromEnv } from "./git.js";

assert.equal(readGitIdentityFromEnv({}), undefined);

assert.deepEqual(
  readGitIdentityFromEnv({
    AUTOSHIP_GIT_AUTHOR_NAME: " Autoship Bot ",
    AUTOSHIP_GIT_AUTHOR_EMAIL: " autoship-bot@users.noreply.github.com ",
  }),
  {
    name: "Autoship Bot",
    email: "autoship-bot@users.noreply.github.com",
    source: "env",
  },
);

assert.throws(
  () => readGitIdentityFromEnv({ AUTOSHIP_GIT_AUTHOR_EMAIL: "autoship-bot@users.noreply.github.com" }),
  /Set both AUTOSHIP_GIT_AUTHOR_NAME and AUTOSHIP_GIT_AUTHOR_EMAIL/,
);

assert.deepEqual(
  deriveGitIdentityFromGitHubUser({
    id: 45_311_586,
    login: "cshyang",
    name: null,
  }),
  {
    name: "cshyang",
    email: "45311586+cshyang@users.noreply.github.com",
    source: "github-token",
  },
);

assert.deepEqual(
  gitIdentityEnv({
    name: "Shyang Chng",
    email: "45311586+cshyang@users.noreply.github.com",
    source: "github-token",
  }),
  {
    GIT_AUTHOR_NAME: "Shyang Chng",
    GIT_AUTHOR_EMAIL: "45311586+cshyang@users.noreply.github.com",
    GIT_COMMITTER_NAME: "Shyang Chng",
    GIT_COMMITTER_EMAIL: "45311586+cshyang@users.noreply.github.com",
  },
);

assert.equal(gitIdentityEnv(undefined), undefined);

assert.deepEqual(
  deriveGitIdentityFromGitHubUser({
    id: 45_311_586,
    login: "cshyang",
    name: "Shyang Chng",
  }),
  {
    name: "Shyang Chng",
    email: "45311586+cshyang@users.noreply.github.com",
    source: "github-token",
  },
);
