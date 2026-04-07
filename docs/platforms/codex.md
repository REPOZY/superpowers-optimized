# Superpowers Optimized for Codex

Guide for using Superpowers Optimized with OpenAI Codex CLI.

## What you get

| Feature | macOS / Linux (hooks enabled) | Windows native |
|---|---|---|
| 30+ workflow skills (debugging, TDD, code review, brainstorming, etc.) | ✅ | ✅ |
| Explicit skill invocation (`$skill-name`, `/skill-name`) | ✅ | ✅ |
| Implicit skill matching (Codex picks skill for task) | ✅ | ✅ |
| AGENTS.md workflow guidance | ✅ | ✅ |
| Startup context injection (project map, state, known issues) | ✅ with hooks | ❌ |
| Proactive skill routing on every prompt | ✅ with hooks | ❌ |
| Dangerous Bash command blocking | ✅ with hooks | ❌ |
| Stop-time discipline reminders | ✅ with hooks | ❌ |
| Custom agents (code-reviewer, red-team) | ✅ manual install | ✅ manual install |
| Bash command compression | ❌ (Codex limitation) | ❌ |
| Read/Edit/Write interception | ❌ (Codex limitation) | ❌ |
| Subagent leakage guard | ❌ (Codex limitation) | ❌ |

**Skills work on all platforms including Windows. Lifecycle hooks require macOS or Linux with hooks enabled.**

---

## Quick Install

Tell Codex:

```
Fetch and follow instructions from https://raw.githubusercontent.com/REPOZY/superpowers-optimized/refs/heads/main/.codex/INSTALL.md
```

---

## Manual Installation

### Prerequisites

- OpenAI Codex CLI (`npm i -g @openai/codex`)
- Git

### Step 1 — Clone the repo

```bash
git clone https://github.com/REPOZY/superpowers-optimized.git ~/.codex/superpowers-optimized
```

### Step 2 — Create the skills symlink

**macOS / Linux:**
```bash
mkdir -p ~/.agents/skills
ln -s ~/.codex/superpowers-optimized/skills ~/.agents/skills/superpowers
```

**Windows (PowerShell — use a junction, works without Developer Mode):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\superpowers" "$env:USERPROFILE\.codex\superpowers-optimized\skills"
```

### Step 3 — Restart Codex

Quit and relaunch. Skills are discovered at startup.

### Step 4 — (Optional, macOS/Linux only) Enable lifecycle hooks

Hooks add startup context injection. Hooks are disabled on Windows native — skip this step on Windows.

**4a.** Enable hook support in `~/.codex/config.toml`:
```toml
[features]
codex_hooks = true
```

**4b.** Link the hook registry:
```bash
ln -s ~/.codex/superpowers-optimized/hooks/codex-hooks.json ~/.codex/hooks.json
```
If `~/.codex/hooks.json` already exists, merge the `SessionStart` entry from `codex-hooks.json` into your existing file instead of replacing it.

---

## How It Works

Codex has native skill discovery — it scans `~/.agents/skills/` at startup, parses SKILL.md frontmatter, and loads skills on demand. Superpowers skills become visible through a single symlink:

```
~/.agents/skills/superpowers/ → ~/.codex/superpowers-optimized/skills/
```

The `using-superpowers` skill is discovered automatically and enforces workflow discipline — it directs Codex to use the right skill for each task type. No additional configuration required for skills.

### Lifecycle hooks (macOS/Linux only)

When hooks are enabled, the SessionStart hook injects project context (project map, state, known issues) into the session at startup. Additional hooks for prompt routing, safety, and reminders are in development (Phase 1).

---

## Usage

### Skills are discovered automatically

Codex activates skills when:
- You mention a skill by name: `use systematic-debugging`, `$brainstorming`
- The task matches a skill's trigger description
- The `using-superpowers` skill routes you to the appropriate skill

### Verify your setup

**Check skills are linked:**
```bash
ls -la ~/.agents/skills/superpowers   # macOS/Linux
```
```powershell
Get-Item "$env:USERPROFILE\.agents\skills\superpowers"   # Windows
```

**Check hooks (if you enabled them):**
```bash
grep -n "codex_hooks" ~/.codex/config.toml
test -f ~/.codex/hooks.json && echo "hooks.json present"
```

---

## Updating

```bash
cd ~/.codex/superpowers-optimized && git pull
```

Skills update instantly through the symlink.

---

## Uninstalling

**macOS / Linux:**
```bash
rm ~/.agents/skills/superpowers
rm -rf ~/.codex/superpowers-optimized   # optional: delete the clone
```

**Windows (PowerShell):**
```powershell
cmd /c rmdir "$env:USERPROFILE\.agents\skills\superpowers"
Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\superpowers-optimized"
```

---

## Troubleshooting

### Skills not showing up

1. Verify the symlink: `ls -la ~/.agents/skills/superpowers`
2. Check skills exist: `ls ~/.codex/superpowers-optimized/skills`
3. Restart Codex — skills are discovered at startup, not dynamically

### Windows junction issues

Junctions normally work without special permissions. If creation fails, run PowerShell as administrator.

### Hooks not running (macOS/Linux)

1. Confirm `codex_hooks = true` is set in `~/.codex/config.toml`
2. Confirm `~/.codex/hooks.json` exists and points to `session-start`
3. Hooks are experimental — check the Codex changelog for status changes

### Hooks on Windows

Codex lifecycle hooks are disabled on Windows native. This is a Codex platform limitation with no current workaround. Use WSL if you need hook functionality on Windows.

---

## Getting Help

- Report issues: https://github.com/REPOZY/superpowers-optimized/issues
- Main documentation: https://github.com/REPOZY/superpowers-optimized
