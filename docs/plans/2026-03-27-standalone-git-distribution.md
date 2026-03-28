# Standalone Git-Based Distribution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use the appropriate execution skill (`executing-plans` or `subagent-driven-development`) to implement this plan.

**Goal:** Convert superpowers-optimized from plugin-managed distribution to standalone git-based distribution with silent auto-update and "What's New" changelog display.

**Architecture:** Users install via `git clone ~/.superpowers && cd ~/.superpowers && ./setup`. The setup script auto-detects installed IDEs, creates symlinks for skill/agent discovery, and registers hooks in IDE-specific settings files with absolute paths. The session-start hook silently auto-updates via `git fetch` + `git reset --hard origin/main` and shows a "What's New" summary from RELEASE-NOTES.md when the version changes.

**Tech Stack:** Bash (cross-platform via Git Bash on Windows), Node.js (hooks), `jq` (JSON manipulation in setup — with pure-bash fallback)

**Assumptions:**
- Users have `git` installed — will NOT work without git
- Users have `bash` available — on Windows via Git Bash (Git for Windows includes it)
- `~/.claude/settings.json` supports a `"hooks"` key with the same structure as plugin `hooks.json` — will NOT work if Claude Code changes the hooks format
- The `main` branch is always in a deployable state — will NOT self-heal if a bad push goes out (user can `git reset --hard HEAD~1`)

---

### Task 1: Create VERSION file

**Files:**
- Create: `VERSION`

**Step 1: Create the file**
Create `VERSION` at the repo root containing `6.0.0` (matching current version in manifests).

```
6.0.0
```

Single line, no trailing content. This becomes the single source of truth for version tracking in standalone mode.

**Step 2: Verify**
```bash
cat VERSION
```
Expected: `6.0.0`

---

### Task 2: Rewrite session-start auto-update logic

**Files:**
- Modify: `hooks/session-start`

**Does NOT cover:** Rollback on bad updates (documented non-goal). Does not cover environments without git.

**Step 1: Replace the `check_for_updates` function (lines 16-84)**

Replace the entire update check section with git-based auto-update logic:

1. **24h cache check** — same cache file `~/.claude/hooks-logs/update-check.cache`, same 86400s TTL. If cache is fresh, skip entirely.

2. **Git fetch** — `git -C "${PLUGIN_ROOT}" fetch origin --quiet` with 3s timeout (`timeout 3` on Linux, `gtimeout 3` on macOS, skip timeout on Windows). Fail silently on network error.

3. **Compare HEAD vs origin/main** — use `git -C "${PLUGIN_ROOT}" rev-parse HEAD` vs `git -C "${PLUGIN_ROOT}" rev-parse origin/main`. If equal, update cache timestamp and skip.

4. **Save old version** — read `${PLUGIN_ROOT}/VERSION` before update.

5. **Git reset** — `git -C "${PLUGIN_ROOT}" reset --hard origin/main` (silent, no user prompt).

6. **Read new version** — read `${PLUGIN_ROOT}/VERSION` after update.

7. **"What's New" extraction** — if old version != new version, extract the relevant section(s) from `${PLUGIN_ROOT}/RELEASE-NOTES.md`:
   - Find the line matching `## v${new_version}`
   - Collect all lines until hitting `## v${old_version}` or end of file
   - Trim to first 30 lines if longer (with "See RELEASE-NOTES.md for full details")
   - Format as an `<important-reminder>` tag with themed summary

8. **Update cache** — write current timestamp to cache file.

The "What's New" output format:
```
<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER:

**Superpowers Optimized has been updated to v{new_version}** (was v{old_version})

**What's New:**
{extracted RELEASE-NOTES.md content}
</important-reminder>
```

**Step 2: Update version reading for non-update paths**

The session-start hook also needs to know the current version for display purposes. Change version reading from:
- OLD: reads from `installed_plugins.json` or `.claude-plugin/plugin.json`
- NEW: reads from `${PLUGIN_ROOT}/VERSION`

**Step 3: Verify**
```bash
# Verify the hook still produces valid JSON output
bash hooks/session-start 2>/dev/null | python3 -c "import sys,json; json.load(sys.stdin); print('Valid JSON')"
```
Expected: `Valid JSON`

---

### Task 3: Create the setup script

**Files:**
- Create: `setup`

**Does NOT cover:** IDEs that don't exist yet. Does not auto-detect IDE versions or validate IDE configuration beyond creating symlinks and registering hooks.

This is the largest task. The script must:

#### Header and argument parsing
```bash
#!/usr/bin/env bash
set -euo pipefail
```
- Parse `--uninstall` flag
- Parse `--host <ide>` flag (optional, defaults to auto-detect)
- Determine `SUPERPOWERS_DIR` (directory where setup script lives — `$(cd "$(dirname "$0")" && pwd)`)

#### Platform detection
- Detect OS: Linux, macOS, Windows (MINGW/MSYS/CYGWIN)
- On Windows: use `cmd /c mklink /J` for junctions instead of `ln -s`

#### IDE auto-detection
Check for each IDE and collect a list of detected IDEs:

| IDE | Detection | Skills path | Hooks mechanism |
|-----|-----------|-------------|-----------------|
| Claude Code | `command -v claude` | N/A (hooks handle everything) | Merge hooks into `~/.claude/settings.json` |
| Cursor | `command -v cursor` or `~/.cursor` dir exists | N/A (uses .cursor-plugin/) | Merge hooks into `~/.cursor/settings.json` (same format as Claude) |
| Codex | `command -v codex` | `~/.agents/skills/superpowers` → symlink | No hooks mechanism |
| OpenCode | `command -v opencode` | `~/.config/opencode/skills/superpowers` → symlink | Plugin JS symlink |
| Gemini CLI | `command -v gemini` | `~/.agents/skills/superpowers` → symlink (shared with Codex) | No hooks mechanism |
| Kiro | `command -v kiro-cli` | TBD (follow Codex pattern) | No hooks mechanism |

#### Hook registration for Claude Code
This is the critical path. Must:

1. Read existing `~/.claude/settings.json` (or create `{}` if missing)
2. Check if a `"hooks"` key exists — if so, check for our hooks (idempotent)
3. Merge our 9 hooks with absolute paths:
   - Replace `${CLAUDE_PLUGIN_ROOT}` with `${SUPERPOWERS_DIR}` in each command
   - Structure must match the plugin `hooks.json` format exactly
4. Write back the merged JSON

For JSON manipulation:
- Try `jq` first (cleanest)
- Fall back to `node -e` (available if Claude Code is installed)
- Last resort: `python3 -c`

Each hook command uses absolute path, e.g.:
```json
"command": "\"${SUPERPOWERS_DIR}/hooks/run-hook.cmd\" session-start"
```
becomes:
```json
"command": "\"/home/user/.superpowers/hooks/run-hook.cmd\" session-start"
```

#### Symlink creation
For each detected IDE that uses symlinks:
1. Create parent directory if needed (`mkdir -p`)
2. Remove existing symlink if present (idempotent)
3. Create new symlink
4. On Windows: use `cmd /c mklink /J` for directory junctions

#### Success output
Print a summary:
```
Superpowers Optimized — installed successfully

  Detected IDEs:
    ✓ Claude Code — hooks registered
    ✓ Codex — skills symlinked
    ✓ OpenCode — plugin + skills symlinked

  Install directory: ~/.superpowers
  Auto-updates: enabled (checked once per day)

  To verify, start a new session and ask: "do you have superpowers?"
  To uninstall: cd ~/.superpowers && ./setup --uninstall
```

#### Uninstall mode (`--uninstall`)
1. For Claude Code: remove our hooks from `~/.claude/settings.json` (leave other hooks intact)
2. For Codex/Gemini: remove `~/.agents/skills/superpowers` symlink
3. For OpenCode: remove plugin + skills symlinks
4. Print confirmation message
5. Remind user to `rm -rf ~/.superpowers` if they want to fully remove

#### Make executable
```bash
chmod +x setup
```

**Step: Verify**
```bash
# Check script is valid bash
bash -n setup && echo "Syntax OK"
# Check it shows help or detects IDEs (dry run)
bash setup --help 2>/dev/null || true
```

---

### Task 4: Update README.md installation section

**Files:**
- Modify: `README.md` (lines 422-502)

**Step 1: Replace the entire Installation section**

Replace lines 422-505 with a unified installation section:

```markdown
## Installation

### Quick Start (all platforms)

```bash
git clone https://github.com/REPOZY/superpowers-optimized.git ~/.superpowers
cd ~/.superpowers && ./setup
```

**Windows (Git Bash or PowerShell with Git):**
```bash
git clone https://github.com/REPOZY/superpowers-optimized.git %USERPROFILE%\.superpowers
cd %USERPROFILE%\.superpowers && bash setup
```

The setup script auto-detects your installed IDEs (Claude Code, Cursor, Codex, OpenCode, Gemini CLI) and configures each one automatically.

### What setup does

- **Claude Code / Cursor:** Registers hooks in your settings file
- **Codex / Gemini CLI:** Creates skills symlink for native discovery
- **OpenCode:** Creates plugin + skills symlinks

### Auto-Updates

Updates are checked once per day at session start. When an update is available, it's applied silently via git and you'll see a "What's New" summary on first use.

### Uninstall

```bash
cd ~/.superpowers && ./setup --uninstall
rm -rf ~/.superpowers
```

### Migrating from Plugin Manager

If you previously installed via `/plugin install`, uninstall the plugin first:
```
/plugin uninstall superpowers-optimized
```
Then follow the Quick Start above.
```

Remove the "Available Update Notification" section and screenshot reference (lines 498-503) — no longer applicable.

**Step 2: Verify**
Visually inspect the README to confirm the installation section reads correctly and has no broken markdown.

---

### Task 5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update "What this is"**
Change:
```
This is a Claude Code plugin (not an application). There is no build step, no dependencies to install, and no runtime to start.
```
To:
```
This is an agentic workflow plugin distributed as a standalone git repository. There is no build step, no dependencies to install, and no runtime to start. Install via `git clone` + `./setup`.
```

**Step 2: Update Critical constraints**
- **Remove** the "Version sync" constraint (no longer required for distribution)
- **Update** the "Hook quoting" constraint to mention both plugin hooks.json AND standalone settings.json registration
- **Add** new constraint: **Standalone paths**: The `setup` script registers hooks in `~/.claude/settings.json` with absolute paths. If hook filenames change, the setup script's hook list must be updated to match.
- **Add** new constraint: **VERSION file**: `VERSION` at repo root is the single source of truth for version tracking. Update it when releasing a new version.

**Step 3: Update Conventions**
Add: `- The VERSION file at repo root tracks the current version (single source of truth)`

**Step 4: Verify**
```bash
cat CLAUDE.md
```
Confirm constraints are accurate and complete.

---

### Task 6: Update .codex/INSTALL.md

**Files:**
- Modify: `.codex/INSTALL.md`

**Step 1: Simplify to point at setup script**

Replace the full manual installation with:

```markdown
# Installing Superpowers Optimized for Codex

## Installation

```bash
git clone https://github.com/REPOZY/superpowers-optimized.git ~/.superpowers
cd ~/.superpowers && ./setup
```

The setup script auto-detects Codex and creates the skills symlink (`~/.agents/skills/superpowers`) automatically.

**Windows (Git Bash):**
```bash
git clone https://github.com/REPOZY/superpowers-optimized.git %USERPROFILE%\.superpowers
cd %USERPROFILE%\.superpowers && bash setup
```

## Verify

```bash
ls -la ~/.agents/skills/superpowers
```

You should see a symlink pointing to `~/.superpowers/skills`.

## Updating

Updates happen automatically at session start (checked once per day). To manually update:
```bash
cd ~/.superpowers && git pull
```

## Uninstalling

```bash
cd ~/.superpowers && ./setup --uninstall
rm -rf ~/.superpowers
```
```

---

### Task 7: Update .opencode/INSTALL.md

**Files:**
- Modify: `.opencode/INSTALL.md`

**Step 1: Simplify to point at setup script**

Same pattern as Task 6, but for OpenCode:

```markdown
# Installing Superpowers Optimized for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- Git installed

## Installation

```bash
git clone https://github.com/REPOZY/superpowers-optimized.git ~/.superpowers
cd ~/.superpowers && ./setup
```

The setup script auto-detects OpenCode and creates the plugin + skills symlinks automatically.

**Windows (Git Bash):**
```bash
git clone https://github.com/REPOZY/superpowers-optimized.git %USERPROFILE%\.superpowers
cd %USERPROFILE%\.superpowers && bash setup
```

## Verify

Ask OpenCode: "do you have superpowers?"

## Updating

Updates happen automatically at session start (checked once per day). To manually update:
```bash
cd ~/.superpowers && git pull
```

## Uninstalling

```bash
cd ~/.superpowers && ./setup --uninstall
rm -rf ~/.superpowers
```

## Tool Mapping

When skills reference Claude Code tools:
- `TodoWrite` → `update_plan`
- `Task` with subagents → `@mention` syntax
- `Skill` tool → OpenCode's native `skill` tool
- File operations → your native tools
```

---

### Task 8: Update project-map.md constraint in CLAUDE.md and hooks

**Files:**
- Modify: `CLAUDE.md` (conventions section)

**Step 1: Add standalone distribution convention**

Add to Conventions:
```
- The `setup` script at repo root handles installation for all IDEs — update it when adding new hooks or changing hook filenames
- Plugin manifests (`.claude-plugin/`, `.cursor-plugin/`) are kept for backwards compatibility but are not the primary distribution mechanism
```

**Step 2: Verify**
Read CLAUDE.md and confirm all conventions are consistent.

---

### Task 9: Add migration notice to plugin manifests

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

**Step 1: Update plugin description to include migration notice**

In `.claude-plugin/plugin.json`, update the description:
```json
"description": "Agentic development framework for Claude Code. NOTE: For the best experience with auto-updates, install standalone: git clone https://github.com/REPOZY/superpowers-optimized.git ~/.superpowers && cd ~/.superpowers && ./setup"
```

In `.claude-plugin/marketplace.json`, update the metadata description similarly.

This ensures users who discover the plugin via the marketplace are directed to the standalone install.

**Step 2: Verify**
```bash
python3 -c "import json; json.load(open('.claude-plugin/plugin.json')); print('Valid')"
python3 -c "import json; json.load(open('.claude-plugin/marketplace.json')); print('Valid')"
```

---

### Task 10: Add RELEASE-NOTES.md entry for standalone distribution

**Files:**
- Modify: `RELEASE-NOTES.md`
- Modify: `VERSION`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.cursor-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

**Step 1: Bump VERSION to 6.0.1**

This is a major change in distribution model — warrants a version bump.

Update `VERSION`:
```
6.0.1
```

Update all three manifest files to `"version": "6.0.1"` (they must stay in sync while they exist).

**Step 2: Add release notes entry**

Prepend to RELEASE-NOTES.md:

```markdown
## v6.0.1 (2026-03-27)

Standalone git-based distribution. One install command for all IDEs. Silent auto-updates. "What's New" changelog.

### New Features

**Standalone installation** — All platforms now use a single installation method: `git clone ~/.superpowers && ./setup`. The setup script auto-detects installed IDEs (Claude Code, Cursor, Codex, OpenCode, Gemini CLI) and configures each one automatically. No more plugin manager, no more manual symlinks, no more per-IDE instructions.

**Silent auto-updates** — Updates are checked once per day at session start. When the `main` branch has new commits, the plugin updates itself silently via git operations. No manual update step, no version bump ceremony, no marketplace refresh.

**"What's New" changelog** — After an auto-update changes the version, the first session shows a summary of what changed, extracted from RELEASE-NOTES.md. Users always know what they got.

### Changes

**VERSION file** — A `VERSION` file at the repo root is now the single source of truth for version tracking. Plugin manifests are kept for backwards compatibility but are no longer the primary version reference.

**Simplified INSTALL docs** — `.codex/INSTALL.md` and `.opencode/INSTALL.md` now point to the unified setup script instead of providing per-IDE manual instructions.

**Migration from plugin manager** — Users who installed via `/plugin install` should uninstall the plugin and re-install standalone. The plugin marketplace listing now includes migration instructions.
```

**Step 3: Verify**
```bash
head -5 VERSION
head -30 RELEASE-NOTES.md
```

---

## Execution Order

Tasks 1 → 2 → 3 are sequential (each builds on the previous).
Tasks 4, 5, 6, 7, 8, 9 are independent of each other (can run in parallel after Task 3).
Task 10 depends on all others being complete (final version bump + release notes).

```
Wave 1: Task 1 (VERSION file)
Wave 2: Task 2 (session-start rewrite)
Wave 3: Task 3 (setup script)
Wave 4: Tasks 4, 5, 6, 7, 8, 9 (parallel — docs + manifests)
Wave 5: Task 10 (version bump + release notes)
```
