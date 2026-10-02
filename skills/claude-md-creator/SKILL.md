---
name: claude-md-creator
description: >
  Creates minimal, high-signal CLAUDE.md and AGENTS.md context files
  based on empirical best practices. Invoke on /init command, "create
  CLAUDE.md", "update CLAUDE.md", "write AGENTS.md", or "set up Claude Code for this
  project". Also invoked by brainstorming when repo lacks a context file.
  tools: Read, Glob, Grep, Bash, Edit
---

# CLAUDE / AGENTS Context File Creator

Creates repository-level context files (`CLAUDE.md`, `AGENTS.md`) that give coding agents the minimum guidance needed to work correctly in a repo.

**Core principle: Only include what the agent cannot easily discover itself.**

Empirical research (Gloaguen et al., "Evaluating AGENTS.md", v3 2026) found that context files did not significantly change task success — LLM-generated ones −0.5% to −2%, developer-written ones +2.4% — while raising cost 20–23%, because agents follow what the file says. Developer-written files did significantly beat LLM-generated ones, which mostly restated existing docs. Every line is an instruction the agent will act on: it costs steps whether or not it helps.

## Trigger Conditions

Invoke this skill when any of the following occur:

- The `/init` command is run
- The user asks to create, write, or update a `CLAUDE.md` or `AGENTS.md`
- The user mentions "agent context", "initialize project", "set up Claude Code"
- A repo is missing a `CLAUDE.md` and the user begins a new project setup
- During `brainstorming` or `writing-plans` when the repo lacks a context file

## What to Include (highest to lowest priority)

### 1. Non-standard build, test, and lint commands

Agents use a tool almost only when the file names it (`uv`: 1.6 uses per task when mentioned, under 0.01 otherwise), so naming the project's *non-default* tooling reliably changes what they run. That is compliance, not proof of benefit: in the same study, testing instructions raised cost without improving success. Include a command only when the agent would otherwise run the wrong one. Spell those out exactly:

```
npm run test -- --watch
uv run pytest tests/ -x
make lint && make typecheck
```

### 2. Non-obvious environment setup

Env vars, required services, secrets handling, database setup — things the agent would get wrong without being told.

### 3. Critical constraints (things that cause wrong behavior if violated)

Focus narrowly on constraints where violating them breaks something:
- "Never edit files in `generated/` — they're overwritten by codegen"
- "Always run migrations through the ORM, never raw SQL"
- "The `legacy/` module uses CommonJS — no ES imports"

### 4. Repo-specific patterns and anti-patterns

Only patterns unique to this project that differ from standard practice. If it's what any experienced developer would do by default, leave it out.

## What to Exclude

These categories were measured to give no benefit (or only cost) in the study, or follow directly from its findings:

### Repository overviews and project descriptions
Nearly every LLM-generated context file included one (100% for Sonnet 4.5, 95–99% for two other models), yet overviews did not meaningfully reduce the steps agents took before reaching the relevant files. The agent explores the repo anyway — an overview just adds tokens without saving any work.

### Directory trees and file structure listings
Same finding: detailed directory structures don't help agents locate relevant files. They navigate codebases by searching, not by reading maps.

### Architecture summaries and design explanations
Broad architecture descriptions don't help agents solve tasks. If there's an architectural constraint that would cause incorrect behavior (e.g., "this is a monorepo — changes to `packages/core` require rebuilding all dependents"), include the constraint. Skip the explanation of how the architecture works.

### Content that duplicates existing documentation
Don't restate what's already in README, docs/, wiki, or inline comments. Duplication is why LLM-generated files didn't help: when researchers removed the repos' documentation, the same files improved performance by 2.7%. With the docs present, they only added cost.

### Generic best practices
"Write tests", "follow SOLID principles", "use meaningful variable names" — agents already know these. Only include project-specific deviations from standard practice.

### Over-constraining requirements
Unnecessary requirements make tasks harder. Every rule you add has a cost — the agent spends reasoning tokens processing it and may over-apply it. Include a constraint only if violating it would cause a real problem in this specific repo.

## Process

1. **Scan the repo** — read key config files (`package.json`, `tsconfig.json`, `Makefile`, CI configs, etc.) and source structure.
2. **Identify gaps** — what would an agent get wrong without explicit guidance? Focus on commands, env setup, and constraints that cause breakage.
3. **Ask minimal questions** — only ask about things that can't be inferred from the repo.
4. **Draft a short, high-signal context file** — aim for under ~50 lines. Every line should pass the test: *"would the agent produce incorrect output without this?"*
5. **Self-assess before presenting** — before showing the draft, apply the filter to every line yourself: *"Is this discoverable by reading the code, types, or inline comments?"* If yes, cut it. If unsure, cut it. Only surface lines that would cause incorrect agent behavior if absent. Do not ask the user to identify redundant items — that is your job.
6. **Present the draft for human review** — LLM-generated context files without human review consistently underperform. Walk the user through what you kept and briefly state *why each section survives the filter* (one phrase per section is enough). Ask only questions the codebase cannot answer — e.g., undocumented team conventions, production-only gotchas, or decisions made outside the repo.
