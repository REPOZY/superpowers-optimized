# Project Memory System

How `session-log.md`, `project-map.md`, and `state.md` work together to give the agent persistent memory across sessions.

---

## The Problem

LLMs have no memory between sessions. Every time you start a new Claude Code session, the agent starts from scratch — it doesn't know what decisions were made last week, what approaches were tried and rejected, which files are the most frequently changed, or what non-obvious constraints exist in the codebase. You end up re-explaining context, re-discovering known bugs, and losing the accumulated knowledge built up over weeks of work.

Superpowers Optimized solves this with three plain markdown files placed at the project root. No database, no embeddings, no external services — just files that Claude can read and write like any other project file.

---

## The Three Files

| File | Created by | Purpose |
|---|---|---|
| `session-log.md` | `context-management` skill (explicit invocation) | Episodic history of decisions across sessions |
| `project-map.md` | `context-management` skill (on demand) | Semantic map of the project structure and critical constraints |
| `state.md` | `context-management` skill (on demand) | Task continuity when work spans multiple sessions |

**Nothing writes memory automatically.** Hooks read these files, inject them, and
remind you to update them — but every write goes through the `context-management`
skill. That is a deliberate trade-off: automatic capture was tried and removed
(see [Why there are no `[auto]` entries](#why-there-are-no-auto-entries)).

---

## session-log.md

### What it is

A chronological log of every meaningful session, built up automatically over time. It lives at the project root alongside `CLAUDE.md` and `package.json`.

### How it's written

Entries are written by the `context-management` skill, and only by it. Invoking
the skill writes a `[saved]` entry containing the goal, decisions made, approaches
rejected, and open questions — structured for future recall.

```markdown
## 2026-03-18 16:45 [saved]
Goal: Fix emoji rendering in session-start hook
Decisions:
- Use literal 🔄 character; bash does not expand \U escapes in double-quoted strings
Rejected: $'\U0001F504' syntax works but reduces readability
Open: Verify emoji renders correctly in Claude's context injection
```

The `stop-reminders` hook does **not** write to the log. Its role is to notice
that a session made decisions worth preserving and to say so before the session
ends — see [What triggers the reminder](#what-triggers-the-decision-log-reminder).

### Why there are no `[auto]` entries

An earlier version had the Stop hook append a minimal `[auto]` entry (skills
invoked, files touched) at the end of every active session. That was removed on
2026-04-04: the information was already available from git and
`context-snapshot.json`, and the entries diluted keyword search — a grep for a
design decision returned file lists instead. `session-log.md` is `[saved]`-only.

The cost of that decision is that memory capture depends on the reminder firing
and on the skill actually being invoked. If a session's decisions are never
saved, they are gone.

### What triggers the decision-log reminder

Because capture is manual, the Stop hook's judgement about *when to ask* is what
determines whether a project accumulates memory at all. `stop-reminders.js` looks
at the files edited since the last `[saved]` entry — not the last 30 minutes — so
a long session keeps being reminded until each work phase is documented.

A session is significant when **any** rule matches:

| Rule | Trigger | Repeats? |
|---|---|---|
| **Workflow/config** | `SKILL.md`, `hooks/*.js`, `CLAUDE.md`, `AGENTS.md`, `agents/*.md`, `specs/*.md`, `plans/*.md`, `plugin.universal.yaml` changed | Yes — until saved |
| **Design** | a design or diagnostic skill ran (`brainstorming`, `writing-plans`, `deliberation`, `premise-check`, `systematic-debugging`, `refactoring`, `performance-investigation`, `dependency-management`) **and** 2+ distinct source files changed | Yes — until saved |
| **Volume** | 4+ distinct source files changed | No — once per session |

Rule 1 alone was the original implementation, and it silently did nothing outside agent-tooling repos: a session that redesigned `src/auth/session.ts` in a React app matched none of those patterns, so the only prompt to preserve the "why" never appeared.

Rule 2 uses direct evidence that decisions were made, so it triggers at a lower file count. It reads per-session skill counts from `~/.claude/hooks-logs/session-stats-<id>.json`; another session's skill usage can never trigger yours.

Rule 3 is a heuristic, so it nudges **once per session**. Without that cap, an ordinary feature session touching four files would re-fire the reminder at every turn until an entry was written — which trains you to ignore it.

Repeated edits to one file never count — the rules measure breadth, not iteration — and documentation- or config-only sessions do not trigger the volume rule.

---

## Checking the health of all of this

```bash
node tools/memory-health.js [project-dir]
```

Read-only. Reports entry counts and injection cost per artifact, how many paths `project-map.md` documents that no longer exist, how many documented files changed since the map's recorded commit, and an approximate capture rate (significant sessions seen in the edit log versus `[saved]` entries written). Run it after a release, or whenever the memory files feel untrustworthy.

### How it helps

The `session-start` hook automatically injects the **last two live `[saved]` entries** into every session before your first message arrives. Entries marked `[superseded by ...]` are skipped — an overturned decision is worse than no decision, because it reads as current.

For older history, the `skill-activator` hook searches the log on every prompt and injects the entries that match. Claude can also `Grep session-log.md` directly. The log is keyword-searchable, per-project, and stays under 200 entries (entries older than 6 months are pruned when the limit is reached).

### How recall picks entries

Matching is IDF-weighted, not keyword-density based. Each keyword is weighted by how rare it is across the log, so a term appearing in every entry contributes almost nothing while a distinctive term dominates. Only the 12 rarest terms in a prompt vote. An entry must clear two gates to be injected:

- **relevance** — at least 30% of the corpus's discriminating weight
- **coverage** — at least 25% of the keywords the prompt actually used

Recency is a tiebreak worth 10%, never a substitute for relevance.

The earlier model scored `0.7 × (hits / total_keywords) + 0.3 × recency`. On a 38-keyword prompt a genuinely relevant entry earned 0.023 from density while the newest entry earned 0.300 from recency alone — recency outweighed relevance about 13×, so recall degenerated into "show the most recent entries that share any word with the prompt." Measured on one real session, that produced 11 redundant re-injections and surfaced an unrelated Codex issue on 5 of 5 prompts.

Each entry is also injected **at most once per session**. A per-session ledger under `~/.claude/hooks-logs/` records what has already been shown, seeded with whatever `session-start` injected at turn one.

This prevents:
- Rediscovering the same bug twice
- Proposing an approach that was already tried and rejected
- Forgetting why a non-obvious constraint exists

**Why injection rather than grep-only:** Relying on the AI to proactively grep is fragile — it might skip the step. Injecting the last two entries is unconditional and reliable. The cost is bounded: two entries is a fixed overhead regardless of how large the log grows.

---

## project-map.md

### What it is

A compact semantic map of the project: what the key directories do, what the load-bearing files are, what non-obvious constraints exist, and which files are changed most frequently. Generated once, updated when the project changes significantly.

### How it's generated

Invoke the `context-management` skill and ask Claude to "map this project" or "generate project map." Claude will:

1. Check for a git repository (to use commit hashes as staleness markers)
2. Glob the project structure and identify directory purposes
3. Document 10–20 key files that are non-obvious or frequently referenced
4. Capture critical constraints — the non-obvious facts that are invisible in the code itself
5. Identify hot files from git history (`git log --name-only`) — the files that
   change most often. Without git, fall back to the files most often named in
   `session-log.md` decisions.

The output is a structured markdown file capped at 150 lines. If it grows larger, it's not a map — it's documentation. Entries for files whose purpose is now obvious are pruned.

```markdown
# Project Map
_Generated: 2026-03-18 14:00 | Git: a3f92b1_

## Directory Structure
hooks/ — Node.js hooks registered in hooks/hooks.json
skills/ — One SKILL.md per workflow; loaded by Claude via Skill tool
.claude-plugin/ — Claude Code plugin manifest and marketplace registration

## Key Files
hooks/run-hook.cmd — Polyglot CMD/bash wrapper; enables bash hooks on Windows
hooks/session-start — Injects using-superpowers routing on every session start
hooks/hooks.json — Hook registration; uses \" quoting (not ') for variable expansion on Linux
.claude-plugin/plugin.json — Version field must stay in sync with all three manifests

## Critical Constraints
- Version must match across plugin.json, cursor plugin.json, and marketplace.json
- hooks.json requires escaped double quotes around ${CLAUDE_PLUGIN_ROOT} paths
- Every SKILL.md must have YAML frontmatter with name and description fields

## Hot Files
hooks/session-start, hooks/stop-reminders.js, .claude-plugin/plugin.json
```

### How it helps

Future sessions can orient to the project instantly — no re-globbing, no re-reading known files, no re-learning constraints that caused bugs before. The map is especially valuable when:

- Resuming work after a gap
- A new contributor starts on the project
- A session starts on an unfamiliar part of the codebase
- The agent needs to know which files are "hot" without scanning git history

---

## state.md

### What it is

A short-lived task continuity file for when work spans multiple sessions. It captures the current goal, decisions made, plan status, verified facts, and open issues — condensed to under 100 lines.

### When to use it

When a complex multi-step task will continue in a future session, invoke `context-management` to save state before ending the session. The next session reads `state.md` first to restore context, then greps `session-log.md` for relevant history.

Unlike `session-log.md` (which is permanent history), `state.md` represents active in-progress work. Once the task is complete, it can be deleted or left as-is.

---

## How the Three Files Work Together

```
Session starts (session-start hook fires automatically)
    │
    ├── Inject project-map.md (full content if ≤200 lines, else Critical Constraints + Hot Files)
    ├── Inject state.md in full (if exists — means work is in progress)
    ├── Inject last 2 [saved] entries from session-log.md (if exists)
    ├── Inject up to 5 most recent OPEN entries from known-issues.md (if exists)
    └── Inject context-snapshot.json summary (changed files + recent commits)
            │
            ▼
        Work happens
            │
            ├── Every prompt: skill-activator injects keyword-matched entries
            │   from session-log.md + known-issues.md (once per session each)
            ├── For older history: Grep session-log.md for task keywords
            └── Session end: Stop hook checks whether the session was significant
                and reminds you to invoke context-management
                    │
                    └── context-management writes the [saved] entry + state.md

Over time:
    project-map.md ──► fast orientation for any future session
    session-log.md ──► "what happened before" for any task (recent: injected; older: grep)
    state.md       ──► "where we were" for the current task
    known-issues.md ──► error→solution map, always injected so debugging starts with it
```

---

## Design Philosophy

**File-based, not database-based.** Everything is plain markdown in the project root. The files are readable by humans, editable with any text editor, searchable with grep, and committable to git. No external services, no embeddings API, no local SQLite — just files.

**Additive, never destructive.** Writes to `session-log.md` only ever append. Superseded decisions are marked, never deleted. You can inspect, edit, prune, or delete any of these files at any time without breaking anything.

**No setup required, but memory is opt-in per session.** None of these files need to exist for the plugin to work, and none are created behind your back. `session-log.md` gets its first entry the first time `context-management` is invoked; the Stop hook's job is to make sure you are asked when it matters. `project-map.md` is generated on demand.

**Works on existing projects.** Installing the plugin on a large existing codebase works exactly the same way — memory accumulates from the first saved session forward. `project-map.md` can be generated at any time to map the existing structure.

**Token-efficient by design.** The session-start hook injects only the last two `[saved]` entries from session-log.md — not the full file. For older history, Claude greps rather than reads. The project map is capped at 150 lines. State is capped at 100 lines. known-issues.md is injected in full but stays short by design (one entry per error signature).

---

## Research & Inspiration

**Jesse Vincent — "Fixing Claude Code's amnesia" (October 2025)**
[blog.fsck.com/2025/10/23/episodic-memory](https://blog.fsck.com/2025/10/23/episodic-memory)

This blog post by the original Superpowers author is the direct source for the memory system. Jesse identified the core problem — Claude Code has no persistent memory between sessions — and framed the solution around the concept of **episodic memory**: the human cognitive faculty for remembering specific things that happened, as distinct from semantic or journaling-based memory.

His original implementation used a SQLite database with vector search, a conversation archive, an MCP integration tool, and a Haiku subagent to manage context retrieval — powerful, but with external dependencies.

This fork (superpowers-optimized) implements the same episodic memory concept as a lighter-weight, dependency-free variant: plain markdown files, keyword grep instead of vector search, and automatic stop-hook writing instead of a separate archiving process. The tradeoff is that retrieval is lexical rather than semantic — you find entries by keyword, not by meaning — but the system requires no database, no embeddings API, and no extra services. Everything stays in project files.

**CLAUDE.md / AGENTS.md pattern.** The broader convention of using project-root markdown files as persistent context for AI coding assistants — established by Anthropic's CLAUDE.md and OpenAI's AGENTS.md guidance — inspired the file-based storage approach. `project-map.md` and `session-log.md` extend this pattern from static human-written configuration to dynamic, session-generated memory.

**Self-consistency reasoning (Wang et al., ICLR 2023).** The `self-consistency-reasoner` skill embedded in debugging and verification uses this paper's technique of sampling multiple reasoning paths and taking a majority vote. Unrelated to the memory system, but the one explicitly cited research technique elsewhere in the plugin.

---

## See Also

- `skills/context-management/SKILL.md` — full procedure for generating maps, saving state, and reading history
- `hooks/stop-reminders.js` — the stop hook that auto-appends session entries
- `docs/superpowers-optimized/specs/2026-03-16-meta-memory-behavioral-self-evolution.md` — proposed future extension: behavioral preference distillation across sessions
