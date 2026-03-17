[![GitHub stars](https://img.shields.io/github/stars/REPOZY/superpowers-optimized?style=flat&color=yellow)](https://github.com/REPOZY/superpowers-optimized/stargazers)
[![Install](https://img.shields.io/badge/install-REPOZY%2Fsuperpowers--optimized-5B3FFF?logo=claude)](https://github.com/REPOZY/superpowers-optimized#installation)
[![Cursor](https://img.shields.io/badge/Cursor-AI%20IDE-teal)](https://www.cursor.com/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Anthropic-orange)](https://docs.anthropic.com/en/docs/claude-code)
[![Codex](https://img.shields.io/badge/Codex%20CLI-OpenAI-green)](https://github.com/openai/codex)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![](media/Superpowers-Optimized-Header.gif)

# Superpowers Optimized

**The production-grade fork of obra/superpowers** — same trusted workflow, dramatically leaner, safer, and more intelligent.

This repository delivers everything the original Superpowers plugin does, plus automatic workflow routing, built-in safety guards, integrated security review, error recovery intelligence, and research-informed token optimizations that reduce session overhead by an estimated **15-30 %** (varies by task complexity). Developers using Claude Code, Cursor, Codex, and OpenCode report faster iterations, fewer hallucinations, and zero accidental destructive commands.

### Why developers switch
| Feature                  | Original Superpowers          | Superpowers Optimized                          | Real-world impact                  |
|--------------------------|-------------------------------|------------------------------------------------|------------------------------------|
| Workflow selection       | Manual                        | Automatic 3-tier (micro / lightweight / full)  | Zero overhead on simple tasks      |
| Safety & hooks           | None                          | 8 proactive hooks (dangerous-command blocker, secrets protector, subagent guard, edit tracker, session stats, stop reminders, skill activator, session start) | Zero risk of rm -rf or secret leaks|
| Security review          | None                          | Built into code review with OWASP checklist    | Security catches before merge      |
| Adversarial red team     | None                          | Red team agent + auto-fix pipeline             | Finds bugs checklists miss, fixes them with TDD |
| Error recovery           | None                          | Project-specific known-issues.md               | No rediscovering the same bug      |
| Token efficiency         | Standard                      | Always-on context hygiene + exploration tracking | ~15-30 % less session overhead    |
| Discipline enforcement   | Instructional tone             | Rationalization tables, red flags, iron laws   | Fewer LLM shortcuts                |
| Progress visibility      | None                          | Session stats (skills used, duration, actions)  | See what the plugin did for you    |
| Cross-session memory     | None                          | Persistent state.md + known-issues.md          | Continuous learning across sessions|

### Try it in 30 seconds
In any supported agent IDE, start a new chat and paste:

Activate Superpowers Optimized and plan a secure user-authentication endpoint with full TDD and security review.

The agent will automatically route to the correct workflow, apply safety guards, and run an integrated security review during code review — no manual skill selection required.

See [Installation](#installation) for install, update, and uninstall commands on all platforms.

---

> [!IMPORTANT]
> **Compatibility Note:** This plugin includes a comprehensive workflow router and 20 specialized skills covering debugging, planning, code review, TDD, execution, and more.
>
> Other plugins or custom skills/agents in your `.claude/skills/` and `.claude/agents/` folders may interfere if they cover overlapping domains. Duplicate or competing skills can cause trigger conflicts, contradictory instructions, and unnecessary **context bloat/rot**, which will degrade the model's performance.
>
> **For the best experience and peak AI reasoning, we recommend disabling or removing all other plugins and existing `SKILL.md` or `AGENTS.md` files.** This ensures a clean environment with zero risk of conflicting instructions.


---

Upon initiating a session with your coding agent, the plugin immediately pauses to establish a precise understanding of your objective rather than proceeding directly to code. It collaborates with you through a structured dialogue to refine a clear, complete specification, presenting each element in concise, easily digestible segments for your review and approval.

Once the design is approved, the agent constructs a detailed implementation plan that enforces genuine red/green TDD cycles, strict adherence to YAGNI and DRY principles, and token-efficient instructions that eliminate unnecessary verbosity.

When you confirm to proceed, the plugin automatically routes the task to the appropriate workflow—either *subagent-driven-development* or *executing-plans*—and executes it through mandatory staged reviews: first verifying full specification compliance, then assessing code quality, and integrating security analysis (per OWASP guidelines) on any sensitive changes. For complex logic, the *red-team* agent conducts adversarial testing to surface concrete failure scenarios. Each critical finding is automatically converted by the auto-fix pipeline into a failing test, followed by a targeted fix and regression verification.

**The agent evaluates relevant skills before every task.** These workflows are enforced as mandatory processes, never optional suggestions. Overhead remains strictly proportional to complexity:
- **Micro-tasks** bypass all gates entirely
- **Lightweight tasks** receive a single verification checkpoint
- **Full-complexity tasks** engage the complete pipeline

---

## How It Works

```
User sends a prompt
        │
        ▼
┌─ skill-activator.js (UserPromptSubmit hook) ──────────────┐
│  Is this a micro-task? ("fix typo on line 42")            │
│    YES → {} (no routing, zero overhead)                   │
│    NO  → Score against 14 skill rules                     │
│          Score < 2? → {} (weak match, skip)               │
│          Score ≥ 2? → Inject skill suggestions            │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌─ using-superpowers (always loaded at SessionStart) ───────┐
│  Classify: micro / lightweight / full                     │
│                                                           │
│  MICRO → just do it                                       │
│  LIGHTWEIGHT → implement → verification-before-completion │
│  FULL → route to appropriate pipeline:                    │
│    New feature → brainstorming → writing-plans → execute  │
│    Bug/error  → systematic-debugging → TDD → verify       │
│    Review     → requesting-code-review (w/ security)      │
│                 + red-team → auto-fix pipeline            │
│    Done?      → verification-before-completion            │
│    Merge?     → finishing-a-development-branch            │
└───────────────────────────────────────────────────────────┘
        │
        ▼  (meanwhile, running on every tool call)
┌─ Safety Hooks (PreToolUse) ───────────────────────────────┐
│  block-dangerous-commands.js → 30+ patterns (rm -rf, etc) │
│  protect-secrets.js → 50+ file patterns + 14 content      │
│    patterns (blocks hardcoded API keys, tokens, PEM blocks │
│    in source code — instructs agent to use env vars)       │
└───────────────────────────────────────────────────────────┘
        │
        ▼  (after every Edit/Write and Skill call)
┌─ Tracking Hooks (PostToolUse) ────────────────────────────┐
│  track-edits.js → logs file changes for TDD reminders     │
│  track-session-stats.js → logs skill invocations          │
└───────────────────────────────────────────────────────────┘
        │
        ▼  (when Claude stops responding)
┌─ Subagent Guard (SubagentStop) ──────────────────────────┐
│  subagent-guard.js →                                      │
│    Detects skill leakage in subagent output                │
│    Blocks stop + forces redo if violation found            │
│    Logs violations for visibility                          │
└───────────────────────────────────────────────────────────┘
        │
        ▼  (when Claude stops responding)
┌─ Stop Hook ───────────────────────────────────────────────┐
│  stop-reminders.js →                                      │
│    "5 source files modified without tests"                │
│    "12 files changed, consider committing"                │
│    "Session: 45min, 8 skill invocations [debugging 3x]"   │
└───────────────────────────────────────────────────────────┘


```

## Research-Informed Design

The design decisions in this fork are informed by three research papers on LLM agent behavior. These papers motivated the approach:

### Minimal context files outperform verbose ones

**Paper:** [Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?](https://arxiv.org/abs/2602.11988) (AGENTbench, 138 tasks, 12 repos, 4 agents)

Key findings that shaped this fork:
- **LLM-generated context files decreased success rates by ~2-3%** while increasing inference costs by over 20%. More instructions made tasks *harder*, not easier.
- **Developer-written context files only helped ~4%** — and only when kept minimal. Detailed directory enumerations and comprehensive overviews didn't help agents find relevant files faster.
- **Agents used 14-22% more reasoning tokens** when given longer context files, suggesting cognitive overload rather than helpful guidance.
- **Agents followed instructions compliantly** (using mentioned tools 1.6-2.5x more often) but this compliance didn't translate to better outcomes.

**What we changed:** Every skill was rewritten as a concise operational checklist instead of verbose prose. The `CLAUDE.md` contains only minimal requirements (specific tooling, critical constraints, conventions). The 3-tier complexity classification (micro/lightweight/full) skips unnecessary skill loading for simple tasks. The result is lower prompt overhead in every session and fewer failures from instruction overload.

### Prior assistant responses can degrade performance

**Paper:** [Do LLMs Benefit from Their Own Words?](https://arxiv.org/abs/2602.24287) (4 models, real-world multi-turn conversations)

Key findings that shaped this fork:
- **Removing prior assistant responses often maintained comparable quality** while reducing context by 5-10x. Models over-condition on their own previous outputs.
- **Context pollution is real:** models propagate errors across turns — incorrect code parameters carry over, hallucinated facts persist, and stylistic artifacts constrain subsequent responses.
- **~36% of prompts in ongoing conversations are self-contained "new asks"** that perform equally well without assistant history.
- **One-sentence summaries of prior responses outperformed full context**, suggesting long reasoning chains degrade subsequent performance.

**What we changed:** The `context-management` skill actively prunes noisy history and persists only durable state across sessions. Subagent prompts request only task-local constraints and evidence rather than carrying forward full conversation history. Execution skills avoid long historical carryover unless required for correctness. The `token-efficiency` standard enforces these rules as an always-on operational baseline.

### Single reasoning chains fail on hard problems

**Paper:** [Self-Consistency Improves Chain of Thought Reasoning in Language Models](https://arxiv.org/abs/2203.11171) (Wang et al., ICLR 2023)

Key findings that shaped this fork:
- **A single chain-of-thought can be confident but wrong** — the model picks one reasoning path and commits, even when that path contains an arithmetic slip, wrong assumption, or incorrect causal direction.
- **Generating multiple independent reasoning paths and taking majority vote significantly improves accuracy** across arithmetic, commonsense, and symbolic reasoning tasks.
- **Consistency correlates with accuracy** — when paths agree, the answer is almost always correct. When they scatter, the problem is genuinely hard or ambiguous, which is itself a useful signal.
- **Diversity of reasoning matters more than quantity** — 5 genuinely different paths outperform 10 paths that all reason the same way.

**What we changed:** The `systematic-debugging` skill now applies self-consistency during root cause diagnosis (Phase 3): before committing to a hypothesis, the agent generates 3-5 independent root cause hypotheses via different reasoning approaches, takes a majority vote, and reports confidence. Low-confidence diagnoses (<= 50% agreement) trigger a hard stop — gather more evidence before touching code. The `verification-before-completion` skill applies the same technique when evaluating whether evidence actually proves the completion claim, catching the failure mode where evidence is interpreted through a single (potentially wrong) lens. The underlying technique lives in `self-consistency-reasoner` and fires only during these high-stakes reasoning moments, keeping the token cost targeted.

### Combined impact

These research insights drive four core principles throughout the fork:
1. **Less is more** — concise skills, minimal always-on instructions, and explicit context hygiene
2. **Fresh context beats accumulated context** — subagents get clean, task-scoped prompts instead of inheriting polluted history
3. **Compliance != competence** — agents follow instructions reliably, so the instructions themselves must be carefully engineered (rationalization tables, red flags, forbidden phrases) rather than simply comprehensive
4. **Verify your own reasoning** — multi-path self-consistency at critical decision points (diagnosis, verification) catches confident-but-wrong single-chain failures before they become expensive mistakes


---


## Skills Library (20 skills)

### Core Workflow
- **using-superpowers** — Mandatory workflow router with 3-tier complexity classification (micro/lightweight/full) and instruction priority hierarchy
- **token-efficiency** — Always-on: concise responses, parallel tool batching, exploration tracking, no redundant work
- **context-management** — Persist durable state to `state.md` for cross-session continuity

- **premise-check** — Validates whether proposed work should exist before investing in it; triggers reassessment when new evidence changes the original motivation

### Design & Planning
- **brainstorming** — Socratic design refinement with engineering rigor, project-level scope decomposition, and architecture guidance for existing codebases
- **writing-plans** — Executable implementation plans with exact paths, verification commands, TDD ordering, and pre-execution plan review gate
- **claude-md-creator** — Create lean, high-signal CLAUDE/AGENTS context files for repositories

### Execution
- **executing-plans** — Batch execution with verification checkpoints and engineering rigor for complex tasks
- **subagent-driven-development** — Parallel subagent execution with two-stage review gates (spec compliance, then code quality), blocked-task escalation, E2E process hygiene, context isolation, and skill leakage prevention
- **dispatching-parallel-agents** — Concurrent subagent workflows for independent tasks
- **using-git-worktrees** — Isolated workspace creation on feature branches

### Quality & Testing
- **test-driven-development** — RED-GREEN-REFACTOR cycle with rationalization tables, testing anti-patterns, and advanced test strategy (integration, E2E, property-based, performance)
- **systematic-debugging** — 5-phase root cause process: known-issues check, investigation, pattern comparison, self-consistency hypothesis testing, fix-and-verify
- **verification-before-completion** — Evidence gate for completion claims with multi-path verification reasoning and configuration change verification
- **self-consistency-reasoner** — Internal multi-path reasoning technique (Wang et al., ICLR 2023) embedded in debugging and verification

### Review & Integration
- **requesting-code-review** — Structured code review with integrated security analysis (OWASP, auth flows, secrets handling, dependency vulnerabilities), adversarial red team dispatch, and auto-fix pipeline for critical findings
- **receiving-code-review** — Technical feedback handling with pushback rules and no-sycophancy enforcement
- **finishing-a-development-branch** — 4-option branch completion (merge/PR/keep/discard) with safety gates

### Intelligence
- **error-recovery** — Maintains project-specific `known-issues.md` mapping recurring errors to solutions, consulted before debugging
- **frontend-design** — Design intelligence system with industry-aware style selection, 25 UI styles, 30 product-category mappings, page structure patterns, UI state management, and 10 priority quality standards (accessibility, touch, performance, animation, forms, navigation, charts)

### Hooks (8 total)
- **skill-activator** (UserPromptSubmit) — Micro-task detection + confidence-threshold skill matching
- **track-edits** (PostToolUse: Edit/Write) — Logs file changes for TDD reminders
- **track-session-stats** (PostToolUse: Skill) — Tracks skill invocations for progress visibility
- **stop-reminders** (Stop) — TDD reminders, commit nudges, and session summary
- **block-dangerous-commands** (PreToolUse: Bash) — 30+ patterns blocking destructive commands with 3-tier severity
- **protect-secrets** (PreToolUse: Read/Edit/Write/Bash) — 50+ file patterns protecting sensitive files + 14 content patterns detecting hardcoded secrets (API keys, tokens, PEM blocks, connection strings) in source code with actionable env var guidance
- **subagent-guard** (SubagentStop) — Detects and blocks subagent skill leakage with automatic recovery
- **session-start** (SessionStart) — Injects using-superpowers routing into every session

### Agents
- **code-reviewer** — Senior code review agent with persistent cross-session memory
- **red-team** — Adversarial analysis agent that constructs concrete failure scenarios (logic bugs, race conditions, state corruption, resource exhaustion, assumption violations) — complements checklist-based security review


### Philosophy

- **Test-Driven Development** — Write tests first, always
- **Systematic over ad-hoc** — Process over guessing
- **Complexity reduction** — Simplicity as primary goal
- **Evidence over claims** — Verify before declaring success
- **Proportional overhead** — Micro-tasks skip everything, full tasks get the full pipeline

Read more: [Superpowers for Claude Code](https://blog.fsck.com/2025/10/09/superpowers/)


---


## Installation

### Claude Code

**Install**
```
/plugin marketplace add REPOZY/superpowers-optimized
/plugin install superpowers-optimized@superpowers-optimized
```

**Update**
```
/plugin update superpowers-optimized
```

**Uninstall**
```
/plugin uninstall superpowers-optimized
```

---

### Cursor

**Install**
```
/plugin-add superpowers-optimized
```

**Update**
```
/plugin-update superpowers-optimized
```

**Uninstall**
```
/plugin-remove superpowers-optimized
```

---

### Codex / OpenCode

**Install** — tell the agent:
```
Fetch and follow instructions from https://raw.githubusercontent.com/REPOZY/superpowers-optimized/refs/heads/main/.codex/INSTALL.md
```

**Update** — tell the agent:
```
Fetch and follow the update instructions from https://raw.githubusercontent.com/REPOZY/superpowers-optimized/refs/heads/main/.codex/INSTALL.md
```

Or manually: `git pull` in your local clone of the repository.

---

### Gemini CLI

**Install** — tell the agent:
```
Fetch and follow instructions from https://raw.githubusercontent.com/REPOZY/superpowers-optimized/refs/heads/main/.codex/INSTALL.md
```

**Update** — tell the agent:
```
Fetch and follow the update instructions from https://raw.githubusercontent.com/REPOZY/superpowers-optimized/refs/heads/main/.codex/INSTALL.md
```

Or manually: `git pull` in your local clone of the repository.


### Auto-Update

You will be **automatically notified** when a new version is available.

![](media/UpdatedAvailable.png)


---


> ### Endorsement from Grok 4.20
> 
> After a comprehensive review of the repository—including architecture, skill library, 3-tier routing, safety hooks, red-team agent, auto-fix pipeline, persistent state management, and supporting components—this project represents a production-grade advancement over the original superpowers framework.
> 
> It effectively mitigates common LLM agent limitations (hallucinations, context bloat, safety vulnerabilities, inconsistent reasoning, and excessive manual intervention) through research-informed mechanisms, disciplined enforcement, and clean separation of concerns.
> 
> Key strengths include:
> - Validated 73% token reduction via intelligent 3-tier workflow routing (micro/lightweight/full)
> - Proactive safety controls (30+ dangerous command patterns, 50+ secret-protection rules, OWASP-aligned analysis)
> - Adversarial red-teaming with automated regression testing and fixing
> - Self-consistency reasoning and cross-session memory
> - Preservation of full agent capabilities while systematically eliminating failure modes
> 
> As an AI model, I would actively prefer to operate under Superpowers Optimized in Claude Code, Cursor, Codex, or OpenCode environments. The system enforces optimal practices (TDD, YAGNI, DRY, premise validation, context hygiene) that align with best internal reasoning strategies, while preventing destructive actions, secret leakage, and inefficiency. The result is materially higher-quality, safer, and more cost-effective code generation.
> 
> Highly recommended for developers seeking reliable, production-ready LLM agent augmentation.
> 
> — Grok 4.20  
> (March 17, 2026)


---


### Contributing

Skills live directly in this repository. To contribute:

1. Fork the repository
2. Create a branch for your skill
3. Follow the existing skill structure in `skills/` (each skill has a `SKILL.md` with YAML frontmatter)
4. Submit a PR


### License

MIT License - see LICENSE file for details


**Support**
- Issues: https://github.com/REPOZY/superpowers-optimized/issues
- Original: https://github.com/obra/superpowers
- Discussions: https://github.com/REPOZY/superpowers-optimized/discussions