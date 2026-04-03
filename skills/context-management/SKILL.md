---
name: context-management
description: >
  Use in long or noisy sessions to persist durable state across session
  boundaries via state.md. Also generates project-map.md when asked to map
  the project. Triggers on: user explicitly asks to "save state", "compress
  context", "map this project", "generate project map", "create project map",
  cross-session handoff needed, or repeated failures indicate context is
  getting stale.
---

# Context Management

## Route first — read this before anything else

| User said | Go to |
|---|---|
| "map this project" / "generate project map" / "create project map" / "update project map" | [Project Map](#project-map) section |
| "save state" / "compress context" / session ending with ongoing work | [Procedure](#procedure) section |
| Starting a task on a project with existing history | Grep `session-log.md` first, then proceed |

Do not default to `state.md` for a map request. Do not default to `project-map.md` for a save-state request.

---

## Purpose

Claude Code automatically compresses context within a session. This skill has two complementary responsibilities:

1. **Cross-session persistence** — `state.md` preserves decisions and progress for the *current task* when a session ends mid-work.
2. **Accumulated project memory** — `session-log.md` builds a searchable history of decisions, rejected approaches, and hard-won facts across sessions. Written manually via this skill — only when there is something worth preserving.

## When to Use

- User explicitly asks to save state or compress context
- Work will continue in a new session and progress must be preserved
- Complex multi-step task has significant accumulated decisions/evidence
- Starting a new task on a project with existing history — grep the log first
- Repeated failures suggest the session has accumulated stale/conflicting context

## Procedure

### At the start of any non-trivial task

Before diving in, grep `session-log.md` for keywords from the current task:

```bash
grep -i "<keyword>" session-log.md | tail -20
```

Use 2-3 keywords (e.g., "hook", "auth", "deploy"). If relevant entries are found, surface them: past decisions, rejected approaches, and known constraints from prior sessions save investigation time and prevent repeating mistakes.

### When saving state (explicit invocation)

1. Extract durable artifacts only:
   - Approved design decisions
   - Active plan tasks and their status
   - Verified facts/evidence
   - Open questions/risks

2. Write `state.md` at the project root with concise sections:
   - `Current Goal`
   - `Decisions`
   - `Plan Status`
   - `Evidence`
   - `Open Issues`

3. Append a `[saved]` entry to `session-log.md`:

**What belongs here vs state.md:**
- `session-log.md [saved]`: permanent decisions, anti-patterns to avoid, carry-forward open items
- `state.md`: active task status, in-progress plans, checklists, version bump readiness — anything that will be resolved soon

**Never include in a [saved] entry:**
- Test results or verification confirmations ("11/11 tests pass")
- Task checklists, file changelogs, or release notes → use `state.md`
- "How it works" walkthroughs → read the code
- Speculative analysis not approved for implementation → use a design doc in `docs/`
- One-time confirmations ("file deleted", "folder removed")
- Newly discovered permanent architectural constraints → add to `project-map.md` Critical Constraints instead

**Token budget: target ≤150 tokens per entry. Hard cap 250. If you're going over, you're writing the wrong content.**

```markdown
## YYYY-MM-DD HH:MM [saved]
Goal: <one line>
Decisions:
- <what was chosen and the one-sentence why — not how it works>
Rejected: <what NOT to try, one line each — the anti-pattern knowledge>
Open: <carry-forward items only>
```

4. In a new session, read `state.md` first to restore task context, then grep `session-log.md` for relevant history.

## session-log.md Format and Maintenance

The log contains a single entry type:

- **[saved]** — written by this skill when explicitly invoked: full decision record including goals, rationale, rejected approaches, and key facts.

**File management:**
- Lives at the project root alongside `CLAUDE.md` and `package.json`
- Keep under 200 entries — prune entries older than 6 months when it exceeds this
- When a decision is permanently superseded (e.g., the approach was replaced), mark it rather than deleting: append `[superseded by YYYY-MM-DD]`
- Do NOT log trivial sessions (the stop hook already filters these out)

**For cross-project recall** (finding how a similar problem was solved in a different codebase): `session-log.md` is per-project and keyword-searchable only. Cross-project recall is outside the scope of this system.

## Project Map

`project-map.md` is the semantic memory layer — it captures the project's structure, key file purposes, and critical non-obvious constraints so that future sessions can orient without re-globbing or re-reading known files. Generate it once; update it when the project changes.

### When to generate or update

- User says "map this project", "generate project map", or "update project map"
- First time setting up memory on a new project
- After a major refactor where many files moved or changed purpose

### Generation procedure

1. **Check for git:**
   ```bash
   git rev-parse --git-dir 2>/dev/null
   ```
   - If git exists → record `git rev-parse HEAD` as the staleness hash.
   - If git does NOT exist → offer: *"No git repository detected. Shall I run `git init`? It enables precise staleness tracking for `project-map.md` — creates a `.git` folder, touches none of your files. If you'd prefer not to, I'll fall back to file timestamp comparison instead, which works fine but is slightly less precise."*
     - User confirms → run `git init --quiet`, then proceed with git hash.
     - User declines → use generation timestamp as the staleness marker.

2. **Map the structure:** Glob the project, identify the top-level directories and their purpose. Do not enumerate every file — summarise by directory.

3. **Document key files:** For each file that is load-bearing, non-obvious, or frequently referenced, write one line describing what it does and why it matters. Aim for 10–20 entries. Skip files whose purpose is obvious from their name.

4. **Capture critical constraints:** The highest-value section. These are non-obvious facts that are not visible in the code itself — quoting rules, platform differences, version sync requirements, things that caused bugs before. Pull these from `session-log.md` `[saved]` entries and from `known-issues.md` if they exist.

5. **Identify hot files:** From `session-log.md` history, list the files most frequently appearing in `Files:` lines. These are the ones most likely to need freshness checks on future sessions.

6. **Write `project-map.md` at the project root** — same level as `CLAUDE.md` and `package.json`, never in `docs/` or any subdirectory. The session-start hook looks for it with `ls project-map.md 2>/dev/null` from the project root — if it's anywhere else, the hook cannot find it and every future session loses the map. Use this format:

```markdown
# Project Map
_Generated: YYYY-MM-DD HH:MM | Git: <short-hash> | (or: Staleness: timestamps)_

## Directory Structure
<dir>/ — <one-line purpose>
<dir>/ — <one-line purpose>

## Key Files
<path> — <what it does and why it matters>
<path> — <what it does and why it matters>

## Critical Constraints
- <non-obvious fact that would cost time to rediscover>
- <non-obvious fact that would cost time to rediscover>

## Hot Files
<path>, <path>, <path>
```

### Update procedure

When the staleness check in the entry sequence flags changed files:
1. Re-read only the flagged files.
2. Update their entries in the Key Files section.
3. Update the git hash / timestamp in the header.
4. If any new critical constraints were discovered this session, add them.

Keep `project-map.md` under 150 lines. If it grows beyond that, it is not a map — it is documentation. Prune file entries for things that are now obvious from context.

## Guardrails

- Do not drop user-provided constraints.
- Do not rewrite requirements; preserve intent.
- If uncertain whether old context matters, keep a short reference in `Open Issues`.
- Keep `state.md` under 100 lines — if it's longer, it's not compressed enough.
