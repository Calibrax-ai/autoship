---
title: autoship
description: Turns messy software work into reliable delivery — humans approve what matters, agents do the grinding.
---

Autoship turns messy software work into reliable delivery.

A half-built prototype that needs to become a real product. An approved ticket that needs to become a shipped change. A shared intent that needs to become a tested feature. All of these share the same pain: most of the effort isn't writing code — it's producing a trustworthy plan the code can be written against.

Autoship does the grinding. Humans approve at the moments that matter: *is this what we want?* and *is this safe to ship?*

[→ See how it works](/architecture/system-overview/) · [GitHub ↗](https://github.com/Calibrax-ai/autoship)

## Four modules, one runtime

**Operational today**

- **Extract** — take an unknown prototype, produce a trustworthy specification and a working build.
- **Deliver** — take an approved issue, produce a reviewed code change through a draft pull request.

**Coming soon**

- **Discover** — take messy signals (tickets, threads, usage, incidents) and produce a grounded, evidence-cited statement of intent.
- **Validate** — take a shipped change and produce outcome truth: did this actually move the thing it claimed to?

One runtime drives all four. Different internal shapes, the same discipline — described below.

## Start here

- **[System overview](/architecture/system-overview/)** — the picture in five minutes
- **[Architecture](/architecture/)** — canonical docs per module
- **[What we've learned](/learnings/)** — five probes, honest notes
- **[Ideas](/ideas/)** — essays and open thinking

## How it stays honest

Four load-bearing ideas. They shape every design choice downstream.

1. **The plan is the ceiling.** If the plan (brief, spec, tests) is weak, the code will be too — *"tests pass"* instead of *"product works."* The highest-leverage work is producing a trustworthy plan before any code is written.
2. **The author doesn't grade its own homework.** Every handoff has a separate reviewer. Without this split, agents learn the shape of a check while reproducing the same failure under a cleaner label.
3. **Mechanical checks go to grep; judgment goes to a reviewer.** Regex tests for exact patterns. Everything that needs interpretation gets a fresh reviewer with no skin in the author's work.
4. **No structure before evidence.** We don't add formalism until a concrete failure demands it. Ideas that were cut are documented in "Considered and deferred" sections so we don't re-derive them.
