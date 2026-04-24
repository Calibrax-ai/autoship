---
run: <run-id>
audited-at: <ISO timestamp>
target-context: <context>
standards-path: <path or none>
verdict: ship | ship-with-caution | do-not-ship
---

# Verdict
<one paragraph with the launch recommendation and why>

# P0 before launch
- <finding>

# P1 before client handoff if possible
- <finding>

# P2 after controlled rollout
- <finding>

# Decision-required gaps
- <gap that cannot be safely converted into an execution issue yet>

# Issue candidates
## <candidate title>
- Priority: P0 | P1 | P2
- Classification: execution-ready | decision-required
- Problem: ...
- Evidence: ...
- Risk if not fixed: ...
- Acceptance criteria:
  - ...
- Verification: ...
- Scope notes: ...

# Checklist status summary
- Build/release path: PASS | FAIL | UNVERIFIED — <evidence or reason>
- CI/test gates: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Deploy/runtime config: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Required production config/env: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Auth and access control: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Security basics: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Tenant isolation and cross-tenant data access: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Role/RBAC boundaries and privilege escalation paths: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Data safety, migrations, backups, and rollback: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Background jobs, queues, scheduled tasks, and webhooks: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Observability, logging, and error reporting: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Performance/scalability baseline: PASS | FAIL | UNVERIFIED — <evidence or reason>
- Operational docs and handoff: PASS | FAIL | UNVERIFIED — <evidence or reason>
