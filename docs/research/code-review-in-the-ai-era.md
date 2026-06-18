# Code Review in the Age of AI-Generated Code — Research Report

*Produced by a focused research pass (35+ web searches/fetches across academic
literature, large-N analytics, vendor framing, and practitioner accounts).
Primary sources were fetched and read. Evidence strength is flagged inline:
**[RCT/large-N]** strong; **[vendor]** has incentive to spin; **[anecdote]**
vivid but not generalizable. Feeds the decisions in
[../adr/20260618-review-plan-intent-provenance-ownership.md](../adr/20260618-review-plan-intent-provenance-ownership.md).*

---

## 1. Research findings

### 1A. The hard parts — why review is slow, painful, and low-quality

**Review's real product is *understanding*, not defect-catching — and tools don't support it.** Triangulated across three independent Microsoft/industry datasets:
- Bacchelli & Bird, *Expectations, Outcomes, and Challenges of Modern Code Review* (ICSE 2013) [RCT/large-N]. Finding defects is the #1 *motivation* (44%), but in the actual comment corpus defects are only the 4th category at **14%**; *code improvements* dominate at 29%, *understanding* ~23%. Comments "mostly address 'micro' level and superficial concerns." https://sback.it/publications/icse2013.pdf
- Czerwonka, Greiler & Tilford, *Code Reviews Do Not Find Bugs* (Microsoft, ICSE-SEIP 2015) [25,000+ devs]: "only about **15%** of comments … indicate a possible defect"; "**at least 50%**" address maintainability. https://www.microsoft.com/en-us/research/wp-content/uploads/2015/05/PID3556473.pdf
- Mäntylä & Lassenius (IEEE TSE 2009): **~75%** of issues found are "evolvability" defects that don't change behaviour.

**The #1 unmet information need is the *rationale* — "why was this change made?" — and no diff tool supplies it.** Bacchelli/Bird: reviewers go out-of-band to the author **20–40%** of the time; "all current code review tools … show a highlighted diff … with no additional tool support." Practitioner framing: decision records "live adjacent to git, not inside it." https://dev.to/huoru/we-have-code-review-we-need-intent-review-1i38

**Hard ergonomic limits — and most PRs blow past them.** SmartBear/Cisco (Cohen, *Best Kept Secrets of Peer Code Review*) [vendor, 2,500 reviews / 3.2M LOC]: defect detection collapses **above ~400 LOC**, **above ~500 LOC/hr**, and **after 60 min**; overall **61% of reviews found zero defects**. https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf

**The natural equilibrium is small changes, ~1–2 reviewers, hours not days.** Sadowski et al., *Modern Code Review at Google* (ICSE-SEIP 2018) [9M reviews]: median change **24 lines**; median reviewer count **1**; **>80%** need ≤1 round; median latency **<4h**; **97%** satisfied with Critique. Google frames review as education/norms/gatekeeping, not bug-finding. https://sback.it/publications/icse2018seip.pdf · Rigby & Bird (FSE 2013): cross-industry median cycle ~15–21h; "only a minimal increase in comments" beyond 2 reviewers.

**Latency — *waiting* — is the dominant cost.** LinearB [733k PRs]: "**50% of PRs were idle for 50.4% of their lifespan**"; small PRs picked up **~20× faster**. https://linearb.io/blog/pull-request-pickup-time · Google: "Most complaints about the code review process are actually resolved by making the process faster" (one-business-day SLA). https://google.github.io/eng-practices/review/reviewer/speed.html

**The cheap failure modes that predict real bugs are measurable.** McIntosh et al. (EMSE 2016): post-release defects are predicted by **lack of participation/discussion** — self-approved changes, **zero-discussion** merges, and review **faster than 200 LOC/hr**. https://rebels.cs.uwaterloo.ca/papers/emse2016_mcintosh.pdf — the empirical face of rubber-stamping.

**Reviewer value is driven by file familiarity, not seniority.** Czerwonka: a reviewer new to the code produces **33%** useful comments, rising to **~67% by their 3rd review** of that area. Bosu/Greiler/Bird (MSR 2015): first-time-file reviewers **32–37%** useful; prior-file reviewers **65–71%** ("almost twice"); same-team vs cross-team differs by **<1.5%**. https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf

**The human cost is real and produces rubber-stamping.** Lee & Hicks, *Understanding and effectively mitigating code review anxiety* (EMSE 2024) [RCT, N=59]: anxiety — not code quality — is the strongest predictor of avoidance, "from completely ignoring reviews, to **rubber stamping or skimming**, to procrastinating." https://link.springer.com/article/10.1007/s10664-024-10550-9

**Power dynamics, gatekeeping, nitpicking — consensus pain.** Google must publish *Handling pushback* and a "**Nit:**" convention; the existence of those docs is the evidence. https://google.github.io/eng-practices/review/reviewer/pushback.html · Dan Lew: with "five nits and one critical issue," the critical comment "can get overlooked." https://blog.danlew.net/2021/02/23/stop-nitpicking-in-code-reviews/

*(Folklore — not cited as data: "90% of comments are nits," "20–40% velocity loss from nitpicking" — could not be traced to a primary source.)*

### 1B. Code-review UX issues — specifically

**GitHub PR is "more of a chat board than a review tool."** Geelnard's gap list: can't mark a commit/file/PR as reviewed; comments "appear in a long, flat, chronological list"; no blocking-issue primitive; on rebase "old commits are dropped … comments on old commits are dropped." https://www.bitsnbites.eu/github-pull-request-code-review/

**Force-push destroys review state — the single most-requested missing primitive.** GitHub Discussion #8808: "On force push, pending and existing reviews are dismissed … a destructive loss of history." Reviewable's whole pitch: "shows net deltas since last time you looked, even if commits get rebased." https://github.com/orgs/community/discussions/8808 · https://docs.reviewable.io/

**GitHub freezes on big diffs** (~30s input delay on a ~500-line diff; marking a file viewed "takes ~5 seconds"). The easiest axis for a native client to win.

**Alphabetical-by-path is the wrong reading order.** Bouraffa & Zaidman, *Not One to Rule Them All* (EASE 2025) [23,241 PRs]: "for **44.6%** of pull requests, the reviewers comment in a non-alphabetical order"; **20.6%** largest-diff-first, **17.6%** by similarity to title/description, **29%** of prod+test PRs reviewed **test-first**. https://arxiv.org/abs/2506.10654 — direct validation of stratified reading order.

**The reviewable atom should be selectable (commit vs PR vs stack).** Meta Sapling: small incremental commits as the unit; tools "optimized for reviewing the entire pull request at once … negate many of the benefits." https://engineering.fb.com/2022/11/15/open-source/sapling-source-control-scalable/ · Graphite: "the ideal PR is 50 lines long … merged ~40% faster." https://graphite.com/blog/the-ideal-pr-is-50-lines-long

**Reviewers manually filter noise and read intent-first.** Practitioners skim and mark boilerplate "viewed" to focus, and read the description first for "what is being changed and, more importantly, why" (Wengel); unbiased review reads the *intent/tests before the code* (Qarem). https://www.gustavwengel.dk/2025/02/19/pr-reviewer-practices.html · https://osamaqarem.com/blog/write-tests-before-you-review-a-pull-request

### 1C. The AI-era shift — what changes when the machine writes the code

**Volume explodes; merge time does not — the bottleneck moved from writing to verifying.** Faros AI [telemetry 10k+ devs]: high-AI teams **merge 98% more PRs** but **review time +91%**, **PR size +154%**, **+9% bugs/dev**. https://www.faros.ai/blog/ai-software-engineering · Codacy/CircleCI: feature throughput +59% YoY but median main-branch throughput **−7%**; "the bottleneck has moved from writing code to deciding whether code is safe to merge." https://blog.codacy.com/ai-breaking-code-review-how-engineering-teams-survive-pr-bottleneck

**AI's quality signature is duplication + churn + collapsed refactoring.** GitClear, *AI Copilot Code Quality 2025* [independent, 211M lines]: **duplicated blocks rose 8×**; **copy/paste exceeded moved/refactored code for the first time (2024)**; refactored lines **~25%→<10%**; short-term churn **5.5%→7.9%**. https://www.gitclear.com/ai_assistant_code_quality_2025_research *(correlational — cite the direction.)*

**Independent data: AI shifts cost downstream to stability.** Google/DORA *2024*: every **+25% AI adoption** ≈ **−7.2% delivery stability**, **−1.5% throughput**, even as individuals feel more productive ("the AI paradox"); **39.2%** distrust AI-generated code. https://dora.dev/research/2024/dora-report/

**Confidence rises while correctness falls.** Perry et al. (Stanford, CCS 2023): AI-assisted participants wrote **less secure code** (e.g. **36% vs 7%** SQL-injection-vulnerable) yet "were more likely to believe that they wrote secure code." https://arxiv.org/abs/2211.03622 · Stack Overflow 2025: trust in AI accuracy **fell to ~33%**; **45%** say debugging AI code takes longer than writing it. https://survey.stackoverflow.co/2025/ai

**The question shifts from "does the author understand this?" to "did *anyone* check?"** Simon Willison: "Almost anyone can prompt an LLM to generate a thousand-line patch … Your job is to deliver code you have proven to work … A computer can never be held accountable. That's your job." Dumping "giant, untested PRs on coworkers … directly shifts the burden of the actual work." https://simonwillison.net/2025/Dec/18/code-proven-to-work/ · Stanford Law CodeX: when the tech that writes the code also decides it works, "the risk is that when it fails, nobody will know why." https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/

**Route review depth by risk, not a flat policy.** Böckeler (martinfowler.com): decide by **Probability × Impact × Detectability**. https://martinfowler.com/articles/exploring-gen-ai/to-vibe-or-not-vibe.html · AI-review checklists converge on **verify against the spec, not self-consistency**; "never trust the test suite generated by the same tool."

**AI *reviewers* drown teams in noise.** cubic: "Up to **40% of AI code review alerts get ignored**." https://www.cubic.dev/blog/the-false-positive-problem-why-most-ai-code-reviewers-fail — benchmarks show a stark catch-rate/noise tradeoff. *This is the strongest argument for NOT building a built-in AI reviewer.* [vendor/affiliate numbers — contested]

**Unreviewed AI output has brutal unit-economics.** curl/Stenberg: in 2025, "**~20%** of all security submissions were AI slop; only **~5%** were genuine," and "every report … engages 3–4 persons … 30 minutes, sometimes up to … three [hours]. Each." https://daniel.haxx.se/blog/2025/07/14/death-by-a-thousand-slops/

**"Paste-the-diff-into-an-LLM" is already a real category** (DiffScribe, Diffity, etc.), with the repeated lesson: "If you paste a giant diff with no goal … you'll get generic advice and miss the real risks." Validates vibecheck's export pillar + on-device summarization.

---

## 2. Improving what vibecheck has today

*Each: finding → build on an existing feature → impact/effort. Ordered by conviction.*

- **P0 — Make the intent panel a *rationale capture*, not just a heuristic summary.** Aggregate PR description + linked issue + detected ADR/spec + any agent-logged plan; pin "the why" above the diff; flag **"no stated intent"** as a signal (correlates with McIntosh's no-discussion defect risk). *High / medium.*
- **P1 — Turn strata into *risk-routing*, and label AI strata.** Force-expand auth/crypto/payments/migrations; detect duplicated/cloned blocks and "recently churned/reverted"; badge AI-authored hunks. *High / medium-high.*
- **P1 — Anchor comments + viewed-state to content, add "changes since I last looked."** The most-requested missing GitHub primitive; client-side (IndexedDB) keeps the server stateless. *Very high / medium.*
- **P2 — Quality-signal nudges** (size vs the 400-LOC band, pace, zero-discussion on large/high-risk approvals). *Medium-high / low-medium.*
- **P2 — Intent-/risk-aware file ordering** with one-click alternatives (intent-first / highest-risk / largest-diff / test-first). *Medium / low.*
- **P2 — Sharpen bot aggregation into a precision filter** (group by confidence/severity; learn dismissals; separate "likely-actionable" from "nit noise"). *Medium-high / medium.*
- **P3 — Intent-anchored, goal-prompted export** (lead with intent; full-file context for selected hunks; stance templates: spec-faithfulness / edge-cases / security / over-abstraction). *High for the differentiator / low-medium.*

---

## 3. Three blue-sky rethinks

### A. Intent-first / spec-first review
Review the *why* in isolation, ratify it before seeing the implementation (de-biased), then read the diff as evidence annotated by how each hunk maps to an intent clause — flag "no stated purpose" hunks and "requirement with no code/test." On-device LLM does the *mapping*, never the judgment; export pre-fills "verify against this spec." *Grounding:* the rationale gap (1A), spec-not-self-consistency (1C), de-biasing (1B). *Reuse: very high* (stateless API, classifier→clauses, on-device LLM, intent panel, closed loop).

### B. Provenance-stratified review
Track who/what wrote each hunk + what proof backs it; stratify by a **provenance × proof matrix**; danger zone = **AI-written + untested + unexplained** (force-expanded, top of queue). The reviewer's submit records a lightweight per-region **attestation** ("I ran this / verified against spec") back to GitHub. *Grounding:* Willison, Stanford Law, curl economics, GitClear churn/duplication smells. *Reuse: high* + one clone/churn detector.

### C. Personal review cockpit
On-device, client-side memory that makes you a "familiar" reviewer everywhere instantly (familiarity drives value, 33%→67%). Pre-briefs on open: "you've reviewed `auth/` 4× — here's what you flagged," "touches the payments invariant in ADR-012," "first-time reviewer here — slow down." **Pull in CODEOWNERS** so your owned areas are known with zero history (cold-start fix) and the plan is personalized per reviewer; cross with B so "AI-written + untested + in *your* area" is the top row. All private (IndexedDB); export carries private context to your own LLM. *Reuse: very high* — the on-device/stateless/export philosophy taken to its conclusion.

---

## What to bet on

**Capture and review *intent* first; make "the why" the lens, and treat its absence as the headline finding.** Three independent datasets agree review's real product is understanding, the #1 unmet need is rationale, and no diff tool supplies it. The AI era sharpens this to a point: the new failure mode is precisely code nobody — author or reviewer — can explain. vibecheck already has the intent panel, the stratified reading order, and the export bundle; the highest-conviction move is to fuse them into an **intent-first spine** (Rethink A, delivered via P0/P1/P3), with provenance (B) and ownership (C, starting with CODEOWNERS) as the other two ranking axes. It's defensible (heuristics + on-device LLM, no server), differentiated (everyone else still stares at the bare diff), and gets *more* valuable as the machines write more of the code.
