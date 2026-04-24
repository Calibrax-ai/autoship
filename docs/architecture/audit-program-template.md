---
title: "program.md — audit run contract"
---

**Purpose:** the run contract the controller reads on every audit invocation. Declares audit scope, tracker behavior, and whether approved issue candidates should be materialized automatically.

**Location:** `.autoship/program.md` at the root of the target repo.

Stable operating knowledge lives in the controller agent file (`.claude/agents/autoship-controller.md`). Repo policy lives in `.autoship/standards.yaml`. This file is only the run contract for one audit loop.

## Contract shape

```yaml
mode: audit

scope:
  repo_root: .
  audit_type: production-readiness
  target_context: production

standards:
  path: .autoship/standards.yaml

external_exposure:
  enabled: false
  url: ""                     # e.g. https://app.example.com
  allowed_methods: [GET, HEAD, OPTIONS]
  auth_probe:
    enabled: false
    login_path: ""             # e.g. /api/auth/login
    username_env: ""           # env var name, not the credential itself
    password_env: ""           # env var name, not the credential itself
    max_bad_login_attempts: 3

tracker:
  source: linear | github | none
  default_issue_state: Backlog
  labels: [source:audit]

output:
  create_issues: true

approval_mode: supervised
max_reaudit_cycles: 1

stop_after: issues-created    # or ready-to-create
```

## Notes

- **`mode: audit` is fixed.** Omit it and the controller should reject the contract.
- **Audit is upstream only.** The run ends at reviewed findings plus approved issue creation or issue-candidate handoff.
- **External exposure is optional and safe by default.** It is a black-box smoke test of the declared public URL, not a pentest. Default methods are `GET`, `HEAD`, and `OPTIONS`; state-changing probes do not belong in audit.
- **Credentials do not belong here.** If auth smoke checks are enabled, reference environment variable names under `auth_probe`, not plaintext usernames/passwords.
- **Policy does not belong here.** Keep hosting, CI, observability, secrets, and release expectations in `.autoship/standards.yaml`, not in `program.md`.
- **Issue creation starts in `Backlog`.** Audit does not throw work straight into execution.
