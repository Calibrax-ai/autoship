---
marp: true
theme: autoship
paginate: true
size: 16:9
title: autoship — Evidence from 10 probes
---

<!--
Compile:
  npx @marp-team/marp-cli@latest autoship-evidence-marp.md -o autoship-evidence-marp.html
  npx @marp-team/marp-cli@latest autoship-evidence-marp.md --pdf --allow-local-files -o autoship-evidence-marp.pdf
-->

<style>
/* ─── autoship deck theme ──────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Young+Serif&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap');

:root {
  --ink:      #0f172a;
  --ink-2:    #1e293b;
  --page:     #f8fafc;
  --muted:    #94a3b8;
  --line:     #334155;
  --teal-300: #5eead4;
  --teal-400: #2dd4bf;
  --teal-500: #14b8a6;
  --teal-600: #0d9488;
  --amber:    #fbbf24;
  --rose:     #fb7185;
}

section {
  background: var(--ink);
  color: #e2e8f0;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 26px;
  line-height: 1.45;
  padding: 64px 80px;
}

/* subtle dot grid like the proposal hero */
section::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0);
  background-size: 32px 32px;
  pointer-events: none;
}

h1, h2, h3 {
  font-family: 'Young Serif', serif;
  color: #ffffff;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 0.35em 0;
}
h1 { font-size: 60px; line-height: 1.05; }
h2 { font-size: 44px; line-height: 1.1; }
h3 { font-size: 30px; color: var(--teal-300); }

p, li { color: #cbd5e1; }
strong { color: #ffffff; }
em { color: var(--teal-300); font-style: normal; }

code, .mono {
  font-family: 'Fira Code', monospace;
  font-size: 0.82em;
  color: var(--teal-300);
  background: rgba(13,148,136,0.12);
  padding: 1px 6px;
  border-radius: 4px;
}

a { color: var(--teal-300); }

ul, ol { margin: 0.4em 0 0.4em 1.1em; padding: 0; }
li { margin: 0.25em 0; }

/* eyebrow / tag */
.eyebrow {
  display: inline-block;
  font-family: 'Fira Code', monospace;
  font-size: 14px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--teal-300);
  background: rgba(13,148,136,0.18);
  padding: 4px 12px;
  border-radius: 999px;
  margin-bottom: 28px;
}

.lede {
  font-size: 30px;
  color: #e2e8f0;
  line-height: 1.35;
  max-width: 900px;
}

.dim { color: var(--muted); }
.pull { color: var(--teal-300); font-weight: 600; }
.amber { color: var(--amber); }
.rose  { color: var(--rose); }

/* pagination */
section::after {
  color: var(--muted);
  font-family: 'Fira Code', monospace;
  font-size: 13px;
}

/* footer slug bottom-left */
section > footer {
  position: absolute;
  bottom: 28px;
  left: 80px;
  color: var(--muted);
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

/* two-column utility */
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: start;
}
.cols-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 28px;
}

/* image caption */
.cap {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.06em;
  margin-top: 8px;
}

figure { margin: 0; }
img { border-radius: 6px; border: 1px solid var(--line); max-width: 100%; }

/* table */
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 18px;
  margin-top: 12px;
}
th, td {
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
th {
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--teal-300);
  font-weight: 500;
  border-bottom: 1px solid var(--teal-600);
}
tr:last-child td { border-bottom: none; }
td.num { font-family: 'Fira Code', monospace; color: var(--teal-300); }

/* highlighted probe row */
tr.hilite td {
  background: rgba(13,148,136,0.14);
  border-bottom: 1px solid var(--teal-500);
  color: #ffffff;
}
tr.hilite td:first-child {
  border-left: 3px solid var(--teal-400);
}
.wall {
  font-family: 'Fira Code', monospace;
  color: var(--teal-300);
  font-size: 0.92em;
}

/* accent rule */
hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, var(--teal-500), transparent);
  margin: 18px 0;
}

/* title / cover slide */
section.cover { padding: 120px 100px; }
section.cover h1 { font-size: 88px; line-height: 1.02; }
section.cover .lede { margin-top: 28px; font-size: 32px; max-width: 880px; }

/* section divider */
section.divider { background: var(--ink-2); }
section.divider h1 { font-size: 72px; color: var(--teal-300); }

/* large stat */
.stat {
  font-family: 'Young Serif', serif;
  font-size: 84px;
  color: var(--teal-300);
  line-height: 1;
}
.stat-label {
  font-family: 'Fira Code', monospace;
  font-size: 14px;
  color: var(--muted);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  margin-top: 8px;
}

/* pullquote */
.quote {
  font-family: 'Young Serif', serif;
  font-size: 38px;
  line-height: 1.25;
  color: #ffffff;
  border-left: 3px solid var(--teal-400);
  padding-left: 28px;
  margin: 20px 0;
}
.quote-attr {
  font-family: 'Fira Code', monospace;
  font-size: 14px;
  color: var(--muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-top: 12px;
}
</style>

<!-- ───────────────────────── 1. Cover ───────────────────────── -->

<!-- _class: cover -->
<!-- _paginate: false -->

<span class="eyebrow">Autoship · Evidence · 2026-04-20</span>

# Demo to production,<br/>without rewriting from scratch.

<p class="lede">Ten probes of empirical evidence that <em>extracting the spec</em> from a working demo is the hard part — and it's tractable.</p>

<footer>autoship · internal · shyang</footer>

<!-- ───────────────────────── 2. Problem ───────────────────────── -->

---

<span class="eyebrow">The problem</span>

# A great demo<br/>is the worst brief.

<div class="cols">

<div>

- The prototype **works** — and customers want it.
- Every quirk, layout choice, and business rule is already decided in code.
- Nobody wrote the spec. The code *is* the spec.
- Hand-rewrites lose intent and cost months.

</div>

<div>

<p class="stat">$$</p>
<p class="stat-label">Months of eng time, lost design intent, and a rewrite that doesn't quite match the demo that won the deal.</p>

</div>

</div>

<footer>02 · the problem</footer>

<!-- ───────────────────────── 3. Why rewrites fail ───────────────────────── -->

---

<span class="eyebrow">Why rewrites fail</span>

# You can't write the spec by hand —<br/>the demo already <em>is</em> one.

<p class="lede">
The prototype encodes hundreds of decisions: status-pill colors, filter semantics, empty-state copy, the exact 8-column table schema, the waterfall math on the balance cards.
</p>

<p class="lede">
A human spec captures maybe 10%. The rest shows up as "bug reports" months later — when it's the <strong>rewrite</strong> that's wrong, not the demo.
</p>

<footer>03 · why rewrites fail</footer>

<!-- ───────────────────────── 4. Thesis ───────────────────────── -->

---

<span class="eyebrow">The thesis</span>

# Extracting the spec is hard.<br/>Rebuilding from a good spec<br/>is <em>tractable</em>.

<p class="lede" style="margin-top: 28px;">
Conventional wisdom: <span class="dim">"code generation is the hard part."</span>
</p>
<p class="lede">
<strong>We invert this.</strong> Modern LLMs can rebuild competently from a clean spec — if you give them one. The work is turning the messy demo <em>into</em> that spec.
</p>

<footer>04 · thesis</footer>

<!-- ───────────────────────── 5. Mechanism ───────────────────────── -->

---

<span class="eyebrow">How it works</span>

# Two stages.

<div class="cols">

<div>

### 1 · Reverse-spec-extraction

Four probe agents walk the demo in parallel:
- <span class="mono">ui-walker</span> — clicks every screen
- <span class="mono">static</span> — reads the code
- <span class="mono">data</span> — pulls sample rows & PDFs
- <span class="mono">external</span> — maps API calls

A reconciler merges them into an **artifact pack** — 6 structured files + screenshots.

</div>

<div>

### 2 · Ralph-loop build

A build-controller slices the work by **user journey** and dispatches per-slice executors.

Each slice is verified by:
- oracle test suite
- Playwright journey walks
- **side-by-side screenshot check** against the prototype

</div>

</div>

<hr/>

<p class="dim" style="text-align:center; margin-top: 10px;">
<span class="mono">demo</span> → <span class="pull">extract</span> → <span class="mono">artifact pack</span> → <span class="pull">build</span> → <span class="mono">production candidate</span>
</p>

<footer>05 · mechanism</footer>

<!-- ───────────────────────── 6. Probe ladder ───────────────────────── -->

---

<span class="eyebrow">Evidence · the probe ladder</span>

# Ten probes. Convergence.

<table>
<thead>
<tr><th>Probe</th><th>Wall-clock</th><th>What was tested</th><th>Key outcome</th></tr>
</thead>
<tbody>
<tr><td>0</td><td class="wall">—</td><td>Manual end-to-end ingest</td><td>Pipeline shape validated</td></tr>
<tr><td>1</td><td class="wall">1h 24m</td><td>Automated ingest</td><td>Fan-out dispatch + schemas prevent thin merges</td></tr>
<tr><td>1.5</td><td class="wall">59m</td><td>Controller agent (Track 2)</td><td>Autonomous orchestration validated</td></tr>
<tr><td>2</td><td class="wall">55m</td><td>First Ralph-loop build</td><td><span class="pull">4.5K lines, 45 endpoints, 11 pages — zero human help</span></td></tr>
<tr><td>2.1</td><td class="wall">5h 16m</td><td>Build-controller + slices</td><td>API 122/122; frontend still a shell</td></tr>
<tr><td>2.2</td><td class="wall">2h 5m</td><td>Playwright journey tests</td><td>28/29 fail on selector mismatch; orphan pages</td></tr>
<tr><td>2.3</td><td class="wall">1h 58m</td><td>Journey-based slicing</td><td>Orphans fixed; <em>dialog theater</em> exposed</td></tr>
<tr><td>2.4</td><td class="wall">4h 16m</td><td>Sample-data + screenshot contract</td><td>Gates absorbed; self-evaluation is the structural cause</td></tr>
<tr class="hilite"><td><strong>2.5</strong></td><td class="wall">4h 27m</td><td><strong>Generator-evaluator</strong> (plan-reviewer)</td><td><strong>Validated — reviewer caught 4 failures; 14/14 journeys · 145/145 oracle</strong></td></tr>
</tbody>
</table>

<p class="dim" style="margin-top: 14px; font-size: 18px;">
Each probe isolates one layer, finds its failure mode, and fixes it. Discipline, not luck.
</p>

<footer>06 · probe ladder</footer>

<!-- ───────────────────────── 7. Moment of proof ───────────────────────── -->

---

<span class="eyebrow">The moment of proof</span>

# Same structure.<br/>Real data.

<div class="cols">

<figure>
<img src="../../../autoship-probe-2.5/artifacts/screenshots/02-accounts-receivable.png" alt="Reference AR page — empty tenant"/>
<p class="cap">REFERENCE · prototype AR page on empty tenant (all US$ 0)</p>
</figure>

<figure>
<img src="probe25-ar-live.png" alt="Autoship-built AR page — populated"/>
<p class="cap">BUILT · autoship output, seeded with prototype's own data</p>
</figure>

</div>

<p class="lede" style="font-size: 22px; margin-top: 18px;">
37 real transactions · Malay counterparties · US$ 254,796 invoiced · pill colors, filter row, waterfall math, amber CoA warning — all <strong>extracted from the prototype</strong>, then rebuilt. <em>Strictly stronger</em> evidence than matching an empty page.
</p>

<footer>07 · proof</footer>

<!-- ───────────────────────── 8. Failure modes found & fixed ───────────────────────── -->

---

<span class="eyebrow">Failure modes we found & fixed</span>

# We learn the system<br/>by breaking it.

<div class="cols">

<div>

### Orphan pages <span class="dim">(2.2)</span>
Slicing by database table left the cross-cutting pages (Dashboard, Analytics) as scaffolds. **Fix:** slice by user journey instead.

### Dialog theater <span class="dim">(2.3)</span>
Buttons opened dialogs that closed without doing anything. **Fix:** every task must assert *post-action state*, not just "dialog appears."

</div>

<div>

### Empty-tenant blind spot <span class="dim">(2.3)</span>
The build never rendered a populated row. **Fix:** seed the prototype's own data before journey walks.

### Self-evaluation <span class="dim">(2.4 → 2.5)</span>
When the same agent plans the work *and* judges its own plan, it passes every gate while cutting scope. **Fix:** separate author from judge. <span class="pull">Validated in 2.5 — reviewer caught 4 plan-level failures.</span>

</div>

</div>

<footer>08 · failure modes</footer>

<!-- ───────────────────────── 9. What this unlocks ───────────────────────── -->

---

<span class="eyebrow">What this unlocks for Calibrax</span>

# A fast path from<br/>prototype to product.

<div class="cols-3">

<div>
<h3>Keep momentum</h3>
<p class="dim">Prototype in days, productize in days. Design intent survives — because the prototype <em>is</em> the spec.</p>
</div>

<div>
<h3>Repeatable</h3>
<p class="dim">The method works per-probe, so it works per-prototype. Each new Calibrax demo plugs into the same pipeline.</p>
</div>

<div>
<h3>Disciplined</h3>
<p class="dim">Every failure becomes a probe, a fix, and a piece of institutional memory — not a regression.</p>
</div>

</div>

<hr/>

<p class="lede" style="margin-top: 20px;">
The prototype isn't a deliverable anymore. It's <strong>upstream of the product</strong>.
</p>

<footer>09 · unlock</footer>

<!-- ───────────────────────── 10. Roadmap ───────────────────────── -->

---

<span class="eyebrow">Roadmap</span>

# From rewrite tool<br/>to <em>rewrite-and-harden</em> tool.

<div class="cols-3" style="margin-top: 18px;">

<div>

<p class="mono" style="color:var(--teal-300); font-size:13px; letter-spacing:0.15em; margin:0 0 8px 0;">JUST COMPLETED · PROBE 2.5</p>

### Generator-evaluator<br/><span class="pull">validated.</span>

<span class="mono">plan-reviewer</span> caught 4 plan-level failures across 2 cycles: S08 bundle, deferred-action Uploads, scope leak, consistency drift.

Build shipped clean: **14/14 journeys · 145/145 oracle**. Reviewer cost **&lt;2%** of probe total.

<p class="dim" style="font-size:16px; margin-top:10px;">The absorb-and-reproduce cycle that required probes 2.2→2.3→2.4 is broken at the planning layer.</p>

</div>

<div>

<p class="mono" style="color:var(--teal-300); font-size:13px; letter-spacing:0.15em; margin:0 0 8px 0;">NEAR-TERM · THREE TRACKS</p>

### Probe 2.6 · interaction fidelity
Static UI handler extraction + reconciler journey-interactions merge. Next probe, already queued.

### App shell scaffold
Pre-built monorepo: shared components, schema helpers, seed bootstrap. Probes start at the slice-loop.

### Multi-model reviewer
Codex alongside <span class="mono">plan-reviewer</span>. Different training distribution, different blind spots — complementary to 2.5, not corrective.

</div>

<div>

<p class="mono" style="color:var(--amber); font-size:13px; letter-spacing:0.15em; margin:0 0 8px 0;">BIGGER SHIFT</p>

### Constrained artifact<br/>improvement loop

Between extract and build, insert specialized hardeners: <span class="mono">data</span>, <span class="mono">api-envelope</span>, <span class="mono">a11y</span>, <span class="mono">missing-index</span>, <span class="mono">error-boundary</span>.

<p class="dim" style="font-size:16px; margin-top:10px;">v1 — constrained: same behavior as demo, but hardened. v2 — <strong>strictly better than the demo</strong>.</p>

</div>

</div>

<hr/>

<p class="lede" style="font-size: 20px; margin-top: 14px;">
Faster to start <span class="dim">(shell)</span> · more honest in judgment <span class="dim">(multi-model)</span> · eventually <strong>strictly better than the demos that seeded it</strong>.
</p>

<footer>10 · roadmap</footer>

<!-- ───────────────────────── 11. Ask ───────────────────────── -->

---

<span class="eyebrow">The ask</span>

# The pattern works.<br/>Help us compound it.

<div class="cols">

<div>

- **A second prototype to probe against.** Probe-2.5 proved the loop converges on one demo. Generalization is the next thesis — pick a Calibrax prototype with a real customer story.
- **30 minutes with a PM** who's lived a demo→production rewrite. Where did *your* spec leak?
- **Resources for the roadmap.** Shell + multi-model reviewer + hardening loop are tractable next steps, not speculative.

</div>

<div>

<div class="quote">
This is no longer a hypothesis under test. It's the first validated architectural change of the probe series.
</div>
<div class="quote-attr">— probe 2.5 · 2026-04-20</div>

</div>

</div>

<footer>11 · ask</footer>

<!-- ───────────────────────── 12. Closing ───────────────────────── -->

<!-- _class: divider -->
<!-- _paginate: false -->

---

<span class="eyebrow">Thank you</span>

# Questions, objections,<br/>prototypes.

<p class="lede" style="margin-top: 28px;">
<span class="mono">shyang@calibrax</span> &nbsp;·&nbsp; <span class="dim">autoship · v0.2 · 2026-04-20</span>
</p>
