---
issue: <id>
issue-rev: <short hash or timestamp of issue body at time of pre-groom>
groomed-at: <ISO timestamp>
trigger: first-groom | regroom
type: Bug | Feature | Refactor
# Bug only:
reproduction-status: confirmed | cannot-reproduce | need-info
# Feature only:
design-status: drafted | need-info
# Refactor only:
preservation-status: ready | needs-coverage-first | need-info
# The status enums above are strictly binary/ternary — no other values are valid.
# Do not invent `ready`, `proposed`, `in-progress`, or any other label.
---

# Outcome
<one-line user-visible result; for Refactor, one-line description of the structural improvement>

# Acceptance Criteria
- AC1 — <observable predicate>. Verification: `<runnable command>`
- AC2 — ...

# Scope Fence
Always-touch:  <specific files>
Ask-first:     <specific files>
Never-touch:   <specific files or patterns>

# Rabbit-Hole Patches
- "<question an executor would otherwise guess>" — <answer with reason>

# Assumptions                       [optional — omit if none]
- <product / business judgment the groomer made on its own that a human might want to override at the Ready→Building gate>
- ...

# Blast-Radius Manifest
Expected to create:  <new files>
Expected to change:  <existing files>
May change:          <existing files>
Must not change:     <existing files or patterns>

# Skeleton Position
<single-slice: first | N+1, following pattern at file:line>
OR
<multi-slice: oracle-plan decomposes into N steps; each step follows <pattern>>

# Concrete Example
<input → output, evidence snippet, or before/after code>

# Intended Layout                  [Frontend/UI only]
<concise ASCII sketch of the main screen, panel, or component arrangement; expose hierarchy, navigation, tab/sidebar placement, empty states, and primary actions>

# Failure Modes                    [optional — include when runtime risk exists]
<bulleted list of failure scenarios the change must handle or explicitly defer>

# Reproduction Steps               [Bug only]
Command:   <the exact command you ran>
Observed:  <what came back>
Expected:  <what the issue says should happen>

# Root Cause                       [Bug only]
<file:line> — quote the offending snippet
<causal chain: why this produces the observed symptom>

# Design Rationale                 [Feature required; Refactor optional]
## Alternatives
- **A**: <description>. Cost: <cost>. Fit: <cite file:line>. Tradeoff: <wins/loses>.
- **B**: ...

## Picked + Reason
<A | B>. Reason: <why, citing simplicity + fit>.

## Constraints                     [when runtime/infra shape]
## Migration Plan                  [when schema changes]
## Backward Compatibility          [when changing APIs or data]
## Rollback Plan                   [when risky]
## Schema Diff                     [when DB change]
## Deferred                        [always optional]

# Behavior Preservation            [Refactor only]
## What must be preserved
- Observable:    <API responses, DB state, events, side effects>
- Non-observable: <performance, ordering, concurrency>

## Preservation Proof
Existing tests covering target:
  - <test file>
  - ...
Coverage gaps (require regression tests BEFORE refactor lands):
  - <behavior not currently tested> — test to add: <file + name>
  - ...
Verification: `<runnable command that exercises all preserved behaviors>`

## Structure Improvement
Before:      <current shape>
After:       <target shape>
Axis:        <coupling | readability | testability | complexity | performance | security>
Measurable:  <metric or criterion for "done">
