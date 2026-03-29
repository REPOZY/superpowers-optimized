# Installing Superpowers Optimized for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- Git installed

## Installation Steps

### 1. Clone Superpowers

**Unix/macOS:**
```bash
git clone https://github.com/REPOZY/superpowers-optimized.git ~/.config/opencode/superpowers
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/REPOZY/superpowers-optimized.git "$env:USERPROFILE\.config\opencode\superpowers"
```

### 2. Register the Plugin

Create a symlink so OpenCode discovers the plugin:

**Unix/macOS:**
```bash
mkdir -p ~/.config/opencode/plugins
rm -f ~/.config/opencode/plugins/superpowers-optimized.js
ln -s ~/.config/opencode/superpowers/.opencode/plugins/superpowers-optimized.js ~/.config/opencode/plugins/superpowers-optimized.js
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.config\opencode\plugins"
Remove-Item -Force "$env:USERPROFILE\.config\opencode\plugins\superpowers-optimized.js" -ErrorAction SilentlyContinue
cmd /c mklink "$env:USERPROFILE\.config\opencode\plugins\superpowers-optimized.js" "$env:USERPROFILE\.config\opencode\superpowers\.opencode\plugins\superpowers-optimized.js"
```

> **Windows note:** File symlinks require Developer Mode enabled (`Settings → For developers → Developer Mode`) or an elevated PowerShell prompt.

### 3. Symlink Skills

Create a symlink so OpenCode's native skill tool discovers superpowers skills:

**Unix/macOS:**
```bash
mkdir -p ~/.config/opencode/skills
rm -rf ~/.config/opencode/skills/superpowers
ln -s ~/.config/opencode/superpowers/skills ~/.config/opencode/skills/superpowers
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.config\opencode\skills"
Remove-Item -Recurse -Force "$env:USERPROFILE\.config\opencode\skills\superpowers" -ErrorAction SilentlyContinue
cmd /c mklink /J "$env:USERPROFILE\.config\opencode\skills\superpowers" "$env:USERPROFILE\.config\opencode\superpowers\skills"
```

### 4. Restart OpenCode

Restart OpenCode. The plugin will automatically inject superpowers context.

Verify by asking: "do you have superpowers?"

## Usage

### Finding Skills

Use OpenCode's native `skill` tool to list available skills:

```
use skill tool to list skills
```

### Loading a Skill

Use OpenCode's native `skill` tool to load a specific skill:

```
use skill tool to load superpowers/brainstorming
```

### Personal Skills

Create your own skills in `~/.config/opencode/skills/`:

```bash
mkdir -p ~/.config/opencode/skills/my-skill
```

Create `~/.config/opencode/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Use when <specific trigger conditions>
---

# My Skill

[Your skill content here]
```

### Project Skills

Create project-specific skills in `.opencode/skills/` within your project.

**Skill Priority:** Project skills > Personal skills > Superpowers skills

## Updating

**Unix/macOS:**
```bash
cd ~/.config/opencode/superpowers && git pull
```

**Windows (PowerShell):**
```powershell
Set-Location "$env:USERPROFILE\.config\opencode\superpowers"; git pull
```

## Troubleshooting

### Plugin not loading

**Unix/macOS:**
1. Check plugin symlink: `ls -l ~/.config/opencode/plugins/superpowers-optimized.js`
2. Check source exists: `ls ~/.config/opencode/superpowers/.opencode/plugins/superpowers-optimized.js`
3. Check OpenCode logs for errors

**Windows (PowerShell):**
1. Check plugin symlink: `Get-Item "$env:USERPROFILE\.config\opencode\plugins\superpowers-optimized.js"`
2. Check source exists: `Test-Path "$env:USERPROFILE\.config\opencode\superpowers\.opencode\plugins\superpowers-optimized.js"`
3. Check OpenCode logs for errors

### Skills not found

**Unix/macOS:**
1. Check skills symlink: `ls -l ~/.config/opencode/skills/superpowers`
2. Verify it points to: `~/.config/opencode/superpowers/skills`
3. Use `skill` tool to list what's discovered

**Windows (PowerShell):**
1. Check skills junction: `Get-Item "$env:USERPROFILE\.config\opencode\skills\superpowers"`
2. Verify it points to: `$env:USERPROFILE\.config\opencode\superpowers\skills`
3. Use `skill` tool to list what's discovered

### Tool mapping

When skills reference Claude Code tools:
- `TodoWrite` → `update_plan`
- `Task` with subagents → `@mention` syntax
- `Skill` tool → OpenCode's native `skill` tool
- File operations → your native tools

## Getting Help

- Report issues: https://github.com/REPOZY/superpowers-optimized/issues
- Full documentation: https://github.com/REPOZY/superpowers-optimized/blob/main/docs/platforms/opencode.md
