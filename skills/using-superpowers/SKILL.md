---
name: using-superpowers
description: >
  BLOCKING REQUIREMENT — invoke this skill BEFORE writing any code, editing
  files, debugging, planning, reviewing, or making any technical tool calls
  beyond reading files. This is the mandatory workflow router for ALL technical
  tasks. Matches: "implement", "build", "fix", "debug", "refactor", "optimize",
  "add feature", "change", "update", "create", "develop", "plan", "review",
  "test", or ANY request that involves code changes. Do NOT skip this skill
  even if the task seems simple. Invoke FIRST, then follow its routing.
---

# Using Superpowers

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill entirely.
</SUBAGENT-STOP>

## Trigger Conditions

Apply this router when a session starts with a technical request, when the user gives a new task or changes topic, when technical work is about to begin without a skill selected, or when the user asks which workflow to use.

**Exception:** Micro tasks (typo fix, single variable rename, 1-line config change) skip the entry sequence entirely. Just do them.

## When the User Names a Specific Skill

A prompt that names a skill ("use brainstorming", "use context management", "run verification") is a **Skill tool invocation request** — never a goal to achieve creatively:

1. Still complete Entry Sequence steps 1–6 — they are always-on prerequisites, not routing.
2. **Invoke the named skill via the `Skill` tool.** Do not re-implement its purpose with ad-hoc agents, manual file reads, or improvised workflows.
3. Skip complexity classification and routing (step 7) — the user already chose the route.

## Instruction Priority (highest to lowest)

1. Explicit user instructions in the current conversation
2. Project-level CLAUDE.md / AGENTS.md
3. Superpowers skill instructions

If a user explicitly overrides a skill's behavior, follow the user. Skills are defaults, not mandates.

## Core Rule

Before technical execution, select workflow skills explicitly and follow them.

Technical execution includes code edits, debugging, planning, review, test status claims, and branch integration actions.

## Entry Sequence

1. Invoke `token-efficiency` at session start — applies to all sessions, always.
<!-- sp:if-no-project-map -->
2. **Fresh project gate** — evaluate both conditions in order:
   - The user's request contains creation/build intent: any of "build", "create", "make", "implement", "scaffold", "set up", "write", "generate", "develop", "start"
   - Run a filesystem check: `ls project-map.md 2>/dev/null` — gate only fires if the file does **not** exist

   If both are true, **pause before proceeding** and tell the user exactly this:

   > Before I start: this directory has no memory files yet, so every future session here starts from scratch — re-exploring the structure, re-reading files, and possibly re-proposing approaches that were already rejected.
   >
   > A ~30-second setup fixes that: `git init` (staleness tracking — creates `.git` only), `project-map.md` (orientation at every session start), and `session-log.md` (decisions and rejected approaches, saved when we record them).
   >
   > **Set this up before we build, or start immediately?**

   Wait for the user's answer before continuing.
   - **If they confirm:** run `git init --quiet` directly (do not ask again), then invoke `context-management` for map generation only, and return to step 3. `context-snapshot.json` first appears next session — its hook ran before git existed.
   - **If they decline:** proceed to step 3.

   **Step 2b** (only when step 2 did NOT fire): if the request is non-trivial, `project-map.md` does not exist, and the project has 10+ files, mention once, without blocking: *"This project has no project-map.md. Say 'map this project' after this task if you want faster orientation in future sessions."*
<!-- /sp:if-no-project-map -->

3. Classify the task as **micro**, **lightweight**, or **full** (see Complexity Classification below).
4. When resuming prior work, read `state.md` if it exists — unless a `<state>` block is already in your context (that is the file). Before ending a session that made significant decisions (design choices, rejected approaches, non-obvious constraints), invoke `context-management` to write a `[saved]` entry, even if the work is complete — nothing else preserves the "why".
5. Read `known-issues.md` if it exists — unless a `<known-issues>` block is already in your context; then open the file only when debugging and the block says more entries exist.
<!-- sp:if-project-map -->
6. Orient from `project-map.md` instead of re-globbing. A `<project-map>` block in your context is that file — Read it again only if the block says it was shortened. For a file's actual logic, read the file itself. Staleness:
   - **With git:** a `<project-map-stale>` tag lists the documented files that changed. Re-read only those, update their Key Files entries, and refresh the header hash and date.
   - **Without git:** re-read Hot Files newer than the map's generation timestamp, update their Key Files entries, and refresh the timestamp.
<!-- /sp:if-project-map -->
7. Follow the path for the classified complexity level.

## Complexity Classification

Classify every task into one of three levels. Do not invoke a separate skill for this — decide inline.

### Hard overrides — check these first, before anything else

If any of the following are true, classify as **full** immediately — do not evaluate the lightweight criteria:

- The change adds, modifies, or removes a condition, gate, or trigger that determines when behavior fires
- The change affects what the user sees or experiences (excluding cosmetic text changes to existing UI — e.g., updating a label, rewording a message, or changing static copy that doesn't alter flow or behavior)
- The change modifies a file that other components depend on (routing rules, entry sequences, config registries, shared hooks)
- The change introduces a path or outcome that didn't exist before

**When in doubt, classify as full.** An unnecessary brainstorming session costs one extra round. Skipping brainstorming on a task that needed it ships a gap. The asymmetry is not equal — always err toward full.

### Micro (skip everything)
- Typo fix, single variable rename, 1-line config change
- **Action:** Just do it. No skills needed.

### Lightweight (fast path)
All of these must be true:
- Change scope is small (~2 files or fewer)
- No new behavior or architecture change
- No cross-module dependency risk
- No migration or data-shape change

**Before classifying as lightweight:** explicitly state in one sentence why each of the four criteria above is satisfied. Do not assume. If you cannot articulate any one of them clearly, classify as full.

**Action:** Go directly to implementation. Only gate: invoke `verification-before-completion` when done. Skip brainstorming, planning, worktrees, and parallel dispatch.

**Exception:** If a dedicated implementation skill exists for this specific task (check the Routing Guide), invoke it — lightweight skips workflow overhead, not implementation skills.

### Full (complete pipeline)
Anything that doesn't qualify as micro or lightweight.

**Action:** Follow the Routing Guide below for the full skill pipeline.

## EnterPlanMode Intercept

If Claude is about to enter plan mode (`EnterPlanMode`), check whether brainstorming has been completed for the current task:

- **No brainstorming done for this task**: invoke `brainstorming` first — plan mode without a validated design leads to plans built on unexamined assumptions.
- **Brainstorming already completed and design approved**: proceed to plan mode / `writing-plans`.

## Routing Guide

- Uncertain whether work should exist at all: `premise-check` (run before brainstorming or planning)
- Complex decision with unclear options or possible mis-framing: `deliberation` → `brainstorming` → `writing-plans`
- New behavior or architecture (problem is well-framed): `brainstorming` → `writing-plans`
- Plan execution (same session, with optional parallel waves): `subagent-driven-development`
- Plan execution (separate session): `executing-plans`
- Experimental or risky work needing branch isolation: `using-git-worktrees` (run before implementation)
- Bug/test failure: `systematic-debugging` → `test-driven-development`
- Completion claim: `verification-before-completion`
- Branch integration: `finishing-a-development-branch`
- Code review (includes security): `requesting-code-review` / `receiving-code-review`
- Independent parallel tasks outside of plan execution: `dispatching-parallel-agents`
- Cross-session state persistence: `context-management`
- Known issue tracking / save recurring fixes: `error-recovery`
- Code restructuring without behavior change: `refactoring` (lock behavior with tests, then restructure incrementally)
- Performance issues (slow, high memory/CPU, latency): `performance-investigation` (measure → profile → fix → re-measure)
- Dependency updates, security vulnerabilities, migrations: `dependency-management` (audit → assess impact → update incrementally → verify)
- UI/frontend implementation: apply `frontend-design` standards
- CLAUDE.md / AGENTS.md creation or update: `claude-md-creator` (applies at any complexity level — never implement directly)
- *(Internal — never route directly):* `self-consistency-reasoner` (used inside `systematic-debugging` and `verification-before-completion`); `token-efficiency` (always on, step 1).

## Context Hygiene

For subagent handoffs, include only current task scope, constraints, evidence, and references to `state.md` when needed.

Avoid carrying forward long assistant reasoning chains unless they contain required artifacts.

## Structured Output Preference

When output feeds another agent/tool step, prefer JSON or YAML schemas defined by the active skill.

## Red Flags

- "I'll just do this first without a skill"
- "Keep all prior assistant text in context"
- Claiming "done" without running verification

If a red flag appears, restart from Entry Sequence.
