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

## Trigger Conditions

This skill MUST be invoked when any of the following occur:

- A new session starts with a technical request
- The user gives a new task or changes topic mid-session
- Any technical work is about to begin without a skill selected
- The user asks "what should I use" or "which workflow"

**Exception:** Micro tasks (typo fix, single variable rename, 1-line config change) can skip the entry sequence entirely. Just do them.

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
2. **Fresh project gate** — evaluate both conditions in order:
   - The user's request contains creation/build intent: any of "build", "create", "make", "implement", "scaffold", "set up", "write", "generate", "develop", "start"
   - Run a filesystem check: `ls project-map.md 2>/dev/null` — gate only fires if the file does **not** exist

   If both are true, **pause before proceeding** and tell the user exactly this:

   > Before I start: this directory has no memory files set up yet. That matters for how well I perform across sessions.
   >
   > **Without setup, every future session on this project starts from scratch:**
   > - I re-explore the project structure even if I mapped it last session
   > - I re-read files I already understood
   > - I may re-propose approaches that were already tried and rejected
   > - I lose the "why" behind every decision the moment the session ends
   >
   > **A ~30-second setup changes that permanently:**
   > - `git init` — enables staleness tracking so I only re-read files that actually changed *(creates `.git` only, nothing else)*
   > - `project-map.md` — I read this at every future session start instead of re-exploring blind
   > - `session-log.md` — auto-captures what was built and decided, so future sessions start with: *"I see from last session that X was rejected because Y — building with that constraint already applied"* instead of rediscovering it
   >
   > **Set this up before we build, or start immediately?**

   Wait for the user's answer before continuing.
   - **If they confirm:** run `git init --quiet` directly (do not ask again — the user just confirmed), then invoke `context-management` for map generation only. Return to step 3 when done.
   - **If they decline:** proceed to step 3.

3. Classify the task as **micro**, **lightweight**, or **full** (see Complexity Classification below).
4. If resuming work from a prior session, read `state.md` if it exists. Use `context-management` to save state before ending a session with ongoing work.
5. If `known-issues.md` exists at the project root, read it to avoid rediscovering known error→solution mappings.
6. If `project-map.md` exists at the project root, read it to orient to the project structure without re-globbing or re-reading known files. Then check staleness:
   - **With git:** run `git rev-parse HEAD` and compare to the hash in the map header.
     - Match → map is fresh, use it as-is.
     - Mismatch → run `git diff --name-only <saved_hash> HEAD` to find changed files. Re-read only those; everything else in the map is still valid.
   - **Without git:** compare the map's generation timestamp to the modification time of files listed in the map's Hot Files section. Re-read any that are newer than the map.
7. Follow the path for the classified complexity level.

## Complexity Classification

Classify every task into one of three levels. Do not invoke a separate skill for this — decide inline.

### Hard overrides — check these first, before anything else

If any of the following are true, classify as **full** immediately — do not evaluate the lightweight criteria:

- The change adds, modifies, or removes a condition, gate, or trigger that determines when behavior fires
- The change affects what the user sees or experiences
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

## Routing Guide

- Complex decision with unclear options or possible mis-framing: `deliberation` → `brainstorming` → `writing-plans`
- New behavior or architecture (problem is well-framed): `brainstorming` → `writing-plans`
- Plan execution (same session): `subagent-driven-development`
- Plan execution (separate session): `executing-plans`
- Bug/test failure: `systematic-debugging` → `test-driven-development`
- Completion claim: `verification-before-completion`
- Branch integration: `finishing-a-development-branch`
- Code review (includes security): `requesting-code-review` / `receiving-code-review`
- Independent parallel tasks: `dispatching-parallel-agents`
- Cross-session state persistence: `context-management`
- UI/frontend implementation: apply `frontend-design` standards

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
