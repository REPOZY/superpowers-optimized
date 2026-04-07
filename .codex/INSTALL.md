# Installing Superpowers Optimized for Codex

## What you get

| Feature | macOS / Linux (hooks enabled) | Windows native |
|---|---|---|
| 30+ workflow skills | ✅ | ✅ |
| Explicit/implicit skill activation | ✅ | ✅ |
| AGENTS.md workflow guidance | ✅ | ✅ |
| Startup context injection (project map, state, known issues) | ✅ with hooks | ❌ |
| Proactive skill routing on every prompt | ✅ with hooks | ❌ |
| Dangerous Bash command blocking | ✅ with hooks | ❌ |
| Stop-time discipline reminders | ✅ with hooks | ❌ |
| Custom agents (code-reviewer, red-team) | ✅ manual install | ✅ manual install |
| Bash compression / Read/Write interception | ❌ Codex limitation | ❌ |
| Subagent leakage guard | ❌ Codex limitation | ❌ |

**Skills work on all platforms. Lifecycle hooks require macOS or Linux.**

---

## Prerequisites

- OpenAI Codex CLI (`npm i -g @openai/codex`)
- Git

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/REPOZY/superpowers-optimized.git ~/.codex/superpowers-optimized
```

### 2. Create the skills symlink

**macOS / Linux:**
```bash
mkdir -p ~/.agents/skills
ln -s ~/.codex/superpowers-optimized/skills ~/.agents/skills/superpowers
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\superpowers" "$env:USERPROFILE\.codex\superpowers-optimized\skills"
```

### 3. Restart Codex

Quit and relaunch the CLI. Skills are discovered at startup.

### 4. (macOS/Linux only) Enable lifecycle hooks

Hooks add startup context injection (project map, known issues, session state). They are **disabled on Windows native** — skip this step on Windows.

**4a.** Add to `~/.codex/config.toml`:
```toml
[features]
codex_hooks = true
```

**4b.** Link the hook registry:
```bash
ln -s ~/.codex/superpowers-optimized/hooks/codex-hooks.json ~/.codex/hooks.json
```

If `~/.codex/hooks.json` already exists, merge the `SessionStart` entry from `~/.codex/superpowers-optimized/hooks/codex-hooks.json` into your existing file instead of replacing it.

### 5. Verify setup

**Check skills:**
```bash
ls -la ~/.agents/skills/superpowers
```

**Check hooks (if you completed step 4):**
```bash
grep -n "codex_hooks" ~/.codex/config.toml
test -f ~/.codex/hooks.json && echo "hooks.json present"
```

### 5. (Optional) Install custom agents

Installs `code-reviewer` and `red-team` agents for use in Codex subagent workflows.

**macOS / Linux:**
```bash
mkdir -p ~/.codex/agents
cp ~/.codex/superpowers-optimized/codex-agents/*.toml ~/.codex/agents/
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.codex\agents"
Copy-Item "$env:USERPROFILE\.codex\superpowers-optimized\codex-agents\*.toml" "$env:USERPROFILE\.codex\agents\"
```

After installing, these agents are available by name in Codex subagent workflows (e.g., "Use the code-reviewer agent to review this branch").

> **Note:** Codex does not officially support bundling custom agents via the plugin manifest. Manual placement in `~/.codex/agents/` is required.

---

## Hook behavior notes

**What hooks do:**
- **SessionStart:** Inject project context (project map, state, known issues, using-superpowers skill) at session start. Check for plugin updates (non-destructive: only applies if the clone is clean and can fast-forward to `origin/main`).
- **UserPromptSubmit:** Proactive skill routing — analyzes each prompt and injects skill suggestions before the model responds.
- **PreToolUse (Bash):** Safety dispatcher — blocks dangerous shell commands (rm -rf ~, curl|sh, fork bombs, etc.) and secret exfiltration attempts before execution.
- **Stop:** Discipline reminders — TDD warning if source files changed without test changes, commit reminder if many files are uncommitted, decision log prompt if core files were modified.

**Windows:** Codex lifecycle hooks are disabled on Windows native. This is a Codex platform limitation. Skills still work. Use WSL for hook functionality on Windows.

To disable startup update checks:
- Set `SUPERPOWERS_AUTO_UPDATE=0`, or
- Create `~/.config/superpowers/update.conf` with `auto_update=false`

---

## Migrating from old install path

If you previously installed to `~/.codex/superpowers` (old path):

```bash
# Update and rename
if [ -d ~/.codex/superpowers ] && [ ! -d ~/.codex/superpowers-optimized ]; then
  mv ~/.codex/superpowers ~/.codex/superpowers-optimized
fi
cd ~/.codex/superpowers-optimized && git pull

# Recreate symlink to new path
rm -f ~/.agents/skills/superpowers
ln -s ~/.codex/superpowers-optimized/skills ~/.agents/skills/superpowers
```

**Windows (PowerShell):**
```powershell
if ((Test-Path "$env:USERPROFILE\.codex\superpowers") -and -not (Test-Path "$env:USERPROFILE\.codex\superpowers-optimized")) {
  Rename-Item "$env:USERPROFILE\.codex\superpowers" "superpowers-optimized"
}
cmd /c rmdir "$env:USERPROFILE\.agents\skills\superpowers"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\superpowers" "$env:USERPROFILE\.codex\superpowers-optimized\skills"
```

Also remove any old bootstrap block from `~/.codex/AGENTS.md` referencing `superpowers-codex bootstrap` — no longer needed.

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
