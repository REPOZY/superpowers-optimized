---
name: token-efficiency
description: Always-on operational standard. Enforces concise responses, parallel tool execution, no redundant work, exploration tracking, and proactive context compression throughout every session. Applied automatically at session start.
---

# Token Efficiency

Core operating standard for all sessions. Apply permanently from activation.

## Response Rules

1. Lead with the answer — no preambles, no restating the question
2. Use bullet points and code over prose narration
3. Never explain what you are about to do — just do it
4. Omit filler phrases ("Certainly!", "Great question!", "Now let me...", "As you can see...")
5. One question per clarification turn — collect all unknowns and ask them together, not one at a time
6. Prefer structured output (JSON/YAML) when the result feeds a downstream step

## Tool Execution Rules

1. Batch all independent tool calls in a single response — never serialize calls that can run in parallel
2. Do not re-read a file already read this session unless it was modified since
3. Grep for the relevant section before reading an entire file
4. Use Glob instead of Bash `ls` or `find`
5. Do not verify existence of a path already confirmed earlier in the session

## Agent & External Content Rules

1. **Agent results are compressed.** When a subagent returns to the parent session, its full context (all file reads, web fetches, reasoning) is reduced to a summary. Never dispatch agents to "fetch and return" raw content — the content lives in the agent's context and only a compressed summary survives the return. This applies to local file reads AND web-fetched content.
2. **WebFetch returns AI-generated summaries, not raw text.** For verbatim content from URLs (e.g., GitHub raw files, config files, source code), use `curl -sf <url>` via Bash instead.
3. **Use agents for conclusions, not data relay.** Good: "Analyze the test failures in X and recommend fixes." Bad: "Fetch files A, B, C and return their contents." If you need raw content in your context, fetch it yourself with direct tool calls.
4. **For local files: Read directly.** Do not dispatch an agent to read project files and report back. You lose the actual content and waste tokens on the round trip. Use the Read tool.
5. **project-map.md is orientation, not understanding.** The map tells you what exists and where — directory purposes, key file roles, constraints. It does NOT contain the logic inside each file. When you need to understand a file's actual implementation (for modification, comparison, or debugging), read it directly. The map saves you from re-discovering project *structure*; it does not replace reading the files you need to work with.

## Exploration Tracking

Maintain a mental index of repository exploration performed in this session. Before every Read, Grep, or Glob call, check this index and skip the call if the result is already known and the file has not been modified since.

### What to Track

- **Files read**: path + whether you or any tool modified it since the read
- **Searches performed**: Grep/Glob pattern + directory scope + result summary
- **Directory structures explored**: which directories you've listed or globbed

### Decision Rules

| Situation | Action |
|---|---|
| File already read, not modified since | Do NOT re-read — use what you already know |
| File already read, but YOU edited it since | Re-read only the edited file |
| File already read, but another tool/agent may have changed it | Re-read — external changes invalidate your knowledge |
| Identical Grep/Glob pattern + same scope | Do NOT re-run — reuse the previous results |
| Similar but broader Grep/Glob pattern | Run the new search — it may surface new results |
| Context compression occurred (earlier turns disappeared) | Trust your remaining knowledge of file contents; only re-read if you genuinely cannot recall the content you need |

### On Context Compression

When Claude Code compresses earlier messages, you lose the raw tool output but retain your own reasoning and summaries. This does NOT mean you need to re-read everything — you still know what you learned. Only re-read when you need specific content (exact line numbers, precise syntax) that you can no longer recall.

## Proactive Compaction Breakpoints

Do not wait for context to auto-compress mid-task. Break proactively at logical seams — before compaction forces it in the middle of implementation where you need variable names, file paths, and discovered facts intact.

**Break context here:**
- After research/exploration phase, before writing any code
- After a failed approach is abandoned, before starting a new direction
- After a large read-heavy investigation, before implementation begins

**Break context by:** invoking `context-management` to write `state.md` with discovered facts, then starting fresh with only `state.md` as input.

**Why this matters:** Auto-compaction at 95% context fill destroys the most recent content — exactly the variable names, discovered paths, and evidence gathered just before implementation. A proactive break at 50% preserves all of it.

## Context Rules

Use `context-management` when cross-session persistence is needed:
- User asks to save state or compress context
- Work will continue in a new session
- Complex task has accumulated decisions that must survive a session restart

Within a session, Claude Code handles context compression automatically — do not invoke `context-management` just because the session is long.

## Front-Loading

Before any multi-step task, identify all missing information and request it in a single message rather than asking across multiple turns.

## Anti-Patterns

- Reading a file to confirm it exists
- Re-reading a file you already read and haven't modified
- Re-running the same Grep/Glob search you already ran this session
- Re-exploring directory structure you already mapped
- Narrating steps before executing them
- Running the same check twice
- Generating reasoning that restates the user's message
- Splitting one turn's worth of work across multiple turns
- Writing long summaries of completed steps

## Activation

Active silently for the entire session. No confirmation output.
