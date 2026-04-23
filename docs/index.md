---
title: autoship
description: Turns messy software work into bounded, reviewable, executable units.
template: splash
hero:
  tagline: Generator-evaluator discipline. Fresh context per unit. Disk-backed state. Four modules around one controller.
  actions:
    - text: System overview
      link: /architecture/system-overview/
      icon: right-arrow
      variant: primary
    - text: GitHub
      link: https://github.com/Calibrax-ai/autoship
      icon: external
      variant: minimal
---

## What autoship does

Autoship turns messy software work — demo reconstruction, bounded change requests, UI redesigns — into bounded, reviewable, executable units. The hard problem is not writing code. The hard problem is producing a trustworthy contract the downstream executor can optimize against.

## Four modules, one controller

**Operational today:**

- **`extract`** — understand an unknown prototype, produce trustworthy artifacts + build
- **`deliver`** — take a known issue, move it to validated change (through draft PR)

**Next:**

- **`discover`** *(coming soon)* — messy signals → trustworthy intent. Read real sources (tickets, threads, usage, incidents); produce grounded intent with every field citing its evidence.
- **`validate`** *(coming soon)* — shipped change → outcome truth. Close the loop by measuring whether a delivery actually moved the signal it claimed to.

All four share the same operational discipline: generator-evaluator at every handoff, fresh context per worker, state on disk. Different internal phase machines, one top-level controller.

## Start here

- **[System overview](/architecture/system-overview/)** — top-level concerns and how the modules fit together
- **[Extract architecture](/architecture/extract-architecture/)** — prototype → trustworthy artifacts
- **[Deliver architecture](/architecture/deliver-architecture/)** — issue → validated change
- **[Cross-track learnings](/learnings/)** — what five probes taught us

## Core principles

1. **Artifact quality is the ceiling.** Weak brief → "tests pass" instead of "product works." Spend attention on briefs and oracles.
2. **Generator-evaluator at every handoff.** The author of an artifact never discharges its own gates.
3. **Mechanical → grep; judgment → reviewer.** If a rule depends on interpretation, it belongs with a reviewer, not a regex.
4. **Don't add structure before the experiment proves it's needed.** Resist reintroducing formalism without a concrete observed problem.
