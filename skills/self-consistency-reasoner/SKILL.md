---
name: self-consistency-reasoner
description: >
  Internal reasoning technique invoked by systematic-debugging and
  verification-before-completion for high-stakes multi-step inference.
  Generates N independent reasoning paths and takes majority vote to
  surface confident-but-wrong single-chain failures. DO NOT invoke
  independently — this skill is embedded in the skills that need it.
---

# Self-Consistency Reasoner

A structured reasoning technique adapted from Self-Consistency (Wang et al., ICLR 2023).

**Core idea**: Complex problems often have multiple valid paths to the correct answer, while incorrect reasoning tends to scatter across different wrong answers. Reaching the answer by several deliberately different routes and comparing the endpoints exposes a single chain that committed early to a wrong assumption.

**What this is not.** The paper samples N *separate* decodes from the same prompt and votes over them; their independence is what makes agreement track accuracy. Paths you write one after another in a single response are not independent — each one can see the ones before it, and all of them share your blind spots. So read the result asymmetrically:

- **Disagreement is strong evidence.** If your own paths diverge, the problem is genuinely ambiguous to you. Stop and gather evidence.
- **Agreement is weak evidence.** It means no route you thought of contradicts the answer — not that the answer is right. It never replaces the test or command that proves it.

---

## When This Fires

This skill is invoked internally by:
- **systematic-debugging** — during root cause hypothesis generation (Phase 3)
- **verification-before-completion** — during evidence evaluation

It fires when:
- The reasoning requires 3+ non-trivial steps
- A single reasoning chain could make a wrong assumption or logical error
- The answer has a **fixed answer set** (a root cause, yes/no, a specific conclusion)
- Being wrong has real cost (wrong diagnosis wastes edits; false "done" wastes review cycles)

---

## How Many Paths to Generate

Scale paths to difficulty:

| Problem Type | Paths |
|---|---|
| Binary verification (does this evidence prove the claim?) | 3 paths |
| Root cause diagnosis with 2-3 candidates | 5 paths |
| Complex multi-factor diagnosis or high-stakes verification | 7 paths |

Default: **5 paths**. The paper suggests 5–10 independent samples to capture most of the gain; in a single response, extra paths add little once the genuinely different starting points are used up — stop there rather than padding.

---

## The Process

### Step 1: Generate N Independent Reasoning Paths

Produce each path **independently** — don't let earlier paths contaminate later ones. Vary your approach deliberately:

- Use a different starting point or framing
- Work forward from given info in one path, backward from the goal in another
- Decompose the problem differently across paths
- For debugging: start from different points in the call stack, assume different failure modes
- For verification: evaluate the evidence from different angles (what would prove it true? what would prove it false?)

Each path tries to reach **the** answer — not a different candidate — and must end with a **clearly parsed final answer**. Asking each path for a *different* hypothesis manufactures disagreement and makes the vote meaningless.

> Diversity of route is the whole point. Paths that all use the same approach just give you one answer repeated — that's not self-consistency, it's greedy decoding in disguise.

### Step 2: Aggregate via Majority Vote

Group answers that mean the same thing (two phrasings of one root cause are one answer), then count. The most frequent answer wins.

**Agreement** = (paths agreeing with the majority answer) / (total paths). It is a count, not a calibrated probability.

### Step 3: Act on Results

- **Unanimous**: Proceed — and still prove it with the test or command; agreement alone is not evidence.
- **Majority (more than half, not all)**: Proceed with the majority answer, but name the minority answer and test it next if the majority fails.
- **No majority (half or fewer)**: **STOP.** Do not proceed. Report the top 2 competing conclusions and the assumption that splits them. Gather more evidence or ask the user.

---

## Output Format

Do **not** show all paths to the user. The process is internal. Surface only the aggregated result:

```
**[Diagnosis/Verdict]**: [the majority-vote answer]
**Agreement**: [X/N paths] — unanimous | majority | no majority

[Only if not unanimous]: Brief note on the minority conclusion and the key divergence point.
```

---

## What the Research Supports — and What It Does Not

- **Majority vote is enough** — the paper found an unweighted vote about as accurate as probability-weighted aggregation, and you have no token probabilities anyway.
- **Agreement tracks accuracy for independent samples** — "low consistency" signals the model does not know. That calibration is measured on separate decodes; for paths in one response, trust the disagreement signal and treat agreement as weak.
- **Diverse reasoning routes matter** — the paper attributes the gain to diversity, and more independent samples kept helping up to 40. It does **not** claim that a few diverse paths beat many similar ones.
- **Needs a fixed answer set** — a root cause or a yes/no verdict qualifies once equivalent phrasings are grouped. Open-ended design questions do not; use `deliberation` for those.

---

## Related Skills

- `systematic-debugging` — invokes SC during root cause hypothesis testing
- `verification-before-completion` — invokes SC during evidence evaluation
