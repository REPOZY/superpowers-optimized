# Project-Level Meta-Memory & Behavioral Self-Evolution  
*(Lightweight, file-mediated reflection and prompt-distillation system)*

**Status:** Proposed / High-innovation candidate   

## One-Sentence Summary

Enable the plugin to gradually learn — and persistently remember — how this specific user prefers to collaborate and how this specific codebase should be handled, by distilling behavioral priors, style preferences, architectural tastes, critique standards, and safety boundaries into compact, versioned, file-based memory artifacts that are automatically injected into future sessions at minimal token cost.

## Motivation

The current implementation already provides excellent cross-session continuity through `state.md` and `known-issues.md`, enforces disciplined workflows, and mitigates hallucinations via red-team + auto-fix loops and self-consistency reasoning.

However, it still treats every new session largely as a fresh context with static skills. Over weeks or months of usage on the same project, users typically develop strong, recurring preferences regarding:

- Naming conventions and architectural patterns  
- Testing style and coverage expectations  
- Commit message format and granularity  
- Preferred error-handling idioms  
- Communication tone, verbosity, and hedging avoidance  
- Response structure and critique focus  
- Risk tolerance for certain classes of changes  

Manually reminding the agent of these preferences is tedious and token-expensive. Fine-tuning is not feasible in this open-source, local-first context.

A lightweight, auditable, file-based reflection system can close this gap, creating the perception — and partial reality — of an agent that visibly improves at collaborating with *this* user and *this* codebase over time.

## Core Mechanism

1. **Reflection & Distillation Phase**  
   After completion of full-complexity tasks (or on explicit user request), a dedicated `meta-reflection-distiller` skill runs a structured meta-review of:  
   - the most recent conversation turns  
   - red-team findings  
   - code-review comments  
   - final code diff  
   - user feedback (if any)  

   It extracts concise, reusable statements in the form:  
   “Prefers X over Y in context Z”  
   “Avoids proposing A because user consistently rejects it”  
   “Expects B testing pattern on domain logic”  
   etc.

2. **Persistent Storage**  
   Distilled statements are **appended** (with timestamps and task references) to one or more versioned files in the project root or `.superpowers/` directory:

   - `project-preferences.md`     (user taste, style, communication)  
   - `effective-patterns.md`      (architecture, idioms, patterns that survive review)  
   - `user-style-guide.md`        (tone, verbosity, structure preferences)  
   - `safety-boundaries.md`       (evolving risk thresholds, allowed/blocked patterns)

3. **Low-Cost Injection**  
   At session start (or before planning/review/red-team phases), a lightweight hook reads the most recent and/or most frequently referenced distillates (limited to ~400–800 tokens total) and injects them at the beginning of the system/user prompt in compact bullet-list form:
