# Installing Superpowers Optimized for Codex

Enable superpowers-optimized skills in Codex via native skill discovery. Just clone and symlink.

## Prerequisites

- Git

## Installation

1. **Clone the superpowers repository:**
   ```bash
   git clone https://github.com/REPOZY/superpowers-optimized.git ~/.codex/superpowers
   ```

2. **Create the skills symlink:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/superpowers/skills ~/.agents/skills/superpowers
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\superpowers" "$env:USERPROFILE\.codex\superpowers\skills"
   ```

3. **Restart Codex** (quit and relaunch the CLI) to discover the skills.

## Migrating from old bootstrap

If you installed superpowers before native skill discovery, you need to:

1. **Update the repo:**
   ```bash
   cd ~/.codex/superpowers && git pull
   ```

2. **Create the skills symlink** (step 2 above) — this is the new discovery mechanism.

3. **Remove the old bootstrap block** from `~/.codex/AGENTS.md` — any block referencing `superpowers-codex bootstrap` is no longer needed.

4. **Restart Codex.**

## Verify

**Unix/macOS:**
```bash
ls -la ~/.agents/skills/superpowers
```

**Windows (PowerShell):**
```powershell
Get-Item "$env:USERPROFILE\.agents\skills\superpowers"
```

You should see a symlink (or junction on Windows) pointing to your superpowers skills directory.

## Updating

**Unix/macOS:**
```bash
cd ~/.codex/superpowers && git pull
```

**Windows (PowerShell):**
```powershell
Set-Location "$env:USERPROFILE\.codex\superpowers"; git pull
```

Skills update instantly through the symlink.

## Uninstalling

**Unix/macOS:**
```bash
rm ~/.agents/skills/superpowers
rm -rf ~/.codex/superpowers   # optional: delete the clone
```

**Windows (PowerShell):**
```powershell
cmd /c rmdir "$env:USERPROFILE\.agents\skills\superpowers"
Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\superpowers"   # optional: delete the clone
```
