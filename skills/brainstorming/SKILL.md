---
name: brainstorming
description: >
  MUST USE when the user wants new features, behavior changes, refactoring
  with new capabilities, or architecture decisions and no approved design
  exists yet. Produces an approved design document before any code is written.
  Triggers on: "build this", "add a feature", "I want to change", "how should we",
  "design", "architect", "new project", "refactor", "we need to add/build/create",
  "implement a new". Routed by using-superpowers, or invoke directly via /brainstorming.
---

# Brainstorming

Turn rough requests into an approved design before implementation.

## Hard Gate

Do not write code, edit files, or invoke implementation skills until design approval is explicit.

## Checklist

1. Inspect project context (relevant files, docs, recent commits).
2. Assess scope: if the project touches 4+ independent subsystems or would require 20+ implementation tasks, decompose into sub-projects. Design each sub-project as a separate spec. Present the decomposition to the user for approval before designing individual specs.
3. Ask all clarifying questions together in a single turn. Use multiple-choice format where possible to reduce round trips.
4. Propose 2-3 approaches with trade-offs and a recommendation.
5. Present design in short sections; confirm each section.
6. For existing codebases: study existing patterns before proposing new ones. Match the project's conventions unless there's a compelling reason to diverge. Design for isolation — prefer changes that minimize blast radius and don't require coordinating across many files.
7. If the repo lacks `CLAUDE.md` / `AGENTS.md` and long-term collaboration is expected, consider using `claude-md-creator` to create a minimal, high-signal context file.
8. **Before approving the design — failure-mode check:** State the top 2-3 ways the chosen approach could fail or not cover all cases. This is adversarial reasoning, not a list of known assumptions — actively try to break the design. For each failure mode found, assess severity:
   - **Critical** (design fails for a significant user scenario): revise the design before proceeding.
   - **Minor** (edge case, acceptable limitation): document as a non-goal in the design.
   Do not skip this step. An approach that survives adversarial questioning is an approach worth approving.
9. Save approved design to `docs/plans/YYYY-MM-DD-<topic>-design.md`.
10. Dispatch a spec reviewer subagent using the prompt template in `spec-document-reviewer-prompt.md`. Replace `[SPEC_FILE_PATH]` with the saved path. If the reviewer returns **Issues Found**, resolve critical issues before proceeding — do not pass a flawed spec to planning.
11. Invoke `writing-plans`.

## Design Contents

Include:
- Scope and non-goals
- Architecture and data flow
- Interfaces/contracts
- Error handling
- Testing strategy
- Rollout or migration notes (if needed)

## Engineering Rigor

Apply senior engineering judgment during design:
- Verify requirements are complete and unambiguous before designing.
- Identify edge cases, error paths, and cross-platform concerns early.
- Evaluate trade-offs explicitly (performance vs. readability, flexibility vs. simplicity).
- Prioritize modularity, SOLID principles, and production-ready standards.
- Flag architectural risks that will be expensive to fix later.

## Interaction Rules

- Batch all questions into a single turn; use multiple choice to reduce ambiguity.
- Remove non-essential scope (YAGNI).
- If user feedback conflicts with prior assumptions, revise design before proceeding.

## Exit Criteria

- User approved the design.
- Failure-mode check completed — critical failure modes resolved, minor ones documented as non-goals.
- Design document exists at the required path.
- Spec reviewer subagent returned **Approved** (or Issues Found were resolved).
- `writing-plans` is invoked as the next skill.
