---
name: writing-plans
description: >
  MUST USE after design approval to decompose requirements into executable
  task plans with verification commands and TDD ordering. Triggers on:
  "write a plan", "break this down", "plan the implementation", after
  brainstorming approval. Routed by brainstorming as the next step.
---

# Writing Plans

Create an implementation plan another agent can execute with minimal ambiguity.

## Output Path

Save to `docs/superpowers-optimized/plans/YYYY-MM-DD-<feature-name>.md`.
- User preferences for plan location override this default.

## Plan Header

```markdown
# <Feature Name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-optimized:subagent-driven-development (recommended) or superpowers-optimized:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** <single sentence>
**Architecture:** <2-4 sentences>
**Tech Stack:** <languages/libraries/tools>
**Assumptions:** <list the key assumptions this plan rests on. For each, state what it excludes: "Assumes X — will NOT work if Y."> *(skip only if the plan contains zero conditional logic)*

---
```

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- Prefer smaller, focused files over large ones that do too much — you reason best about code you can hold in context at once, and your edits are more reliable when files are focused.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure — but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Rules

- Keep tasks independent when possible.
- Keep each step to one action (roughly 2-5 minutes).
- Use exact file paths.
- Include exact verification commands and expected outcomes.
- Use TDD ordering when code behavior changes.
- For ambiguous features, ask clarifying questions before finalizing the plan rather than guessing.

## Task Template

````markdown
### Task N: <Name>

**Files:**
- Create: `<path>`
- Modify: `<path>`
- Test: `<path>`

**Does NOT cover:** *(required when this task adds a condition, gate, trigger, or any "when X do Y" logic — state the scenarios the condition excludes. If an excluded scenario should be covered, revise this task before implementing.)*

- [ ] **Step 1: Write failing test**

```<lang>
<actual test code>
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<command>`
Expected: FAIL with "<expected failure reason>"

- [ ] **Step 3: Implement minimal change**

```<lang>
<actual implementation code>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<command>`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add <files>
git commit -m "<message>"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Quality Bar

- No vague steps like "update logic".
- No hidden dependencies between distant tasks.
- Call out migrations, feature flags, and rollback checks when relevant.
- Prefer small vertical slices over large horizontal phases.

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan and completing self-review, offer execution choice:

**"Plan complete and saved to `docs/superpowers-optimized/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers-optimized:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers-optimized:executing-plans
- Continuous execution with checkpoints for review
