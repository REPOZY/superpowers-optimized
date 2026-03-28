# Installing Superpowers Optimized for Codex

Enable superpowers-optimized skills in Codex via native skill discovery. Just clone and symlink.

## Prerequisites

- Git

## Installation

1. **Clone the superpowers repository:**
   ```bash
   git clone https://github.com/REPOZY/superpowers-optimized.git ~/.codex/superpowers-optimized
   ```

2. **Create the skills symlink:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/superpowers-optimized/skills ~/.agents/skills/superpowers
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\superpowers" "$env:USERPROFILE\.codex\superpowers-optimized\skills"
   ```

3. **(Optional — for auto-update only) Enable Codex lifecycle hooks in config:**
   ```toml
   [features]
   codex_hooks = true
   ```

   Add this to `~/.codex/config.toml`. Skills work without this step — hooks only add the startup auto-update check.

4. **(Optional — for auto-update only) Enable the Codex SessionStart hook:**
   ```bash
   ln -s ~/.codex/superpowers-optimized/hooks/codex-hooks.json ~/.codex/hooks.json
   ```

   If `~/.codex/hooks.json` already exists, merge the `SessionStart` entry from
   `~/.codex/superpowers-optimized/hooks/codex-hooks.json` into your existing file instead of replacing it.

5. **Restart Codex** (quit and relaunch the CLI) to discover the skills.

6. **Verify setup:**
   ```bash
   ls -la ~/.agents/skills/superpowers
   ```

   To verify hook setup (if you completed steps 3–4):
   ```bash
   grep -n "codex_hooks" ~/.codex/config.toml
   test -f ~/.codex/hooks.json && echo "hooks.json present"
   ```

### Hook support note

Codex lifecycle hooks are currently not supported on Windows native.
On Windows, installation still works for skills, but the SessionStart hook auto-update does not run.

When hooks run, startup auto-update is non-destructive: it only applies if the
plugin clone is clean and can fast-forward to `origin/main`. Dirty, local-ahead,
or diverged clones are not changed automatically.

To disable startup auto-update checks:

1. Set `SUPERPOWERS_AUTO_UPDATE=0`, or
2. Create `~/.config/superpowers/update.conf` with `auto_update=false`.

## Migrating from old install path

If you previously installed to `~/.codex/superpowers` (the old canonical path), migrate to the new path:

1. **Update the repo (supports both old and new install paths):**
   ```bash
   if [ -d ~/.codex/superpowers-optimized ]; then
     cd ~/.codex/superpowers-optimized && git pull
   elif [ -d ~/.codex/superpowers ]; then
     cd ~/.codex/superpowers && git pull
   else
     git clone https://github.com/REPOZY/superpowers-optimized.git ~/.codex/superpowers-optimized
   fi
   ```

2. **Rename old install path if needed** (legacy `~/.codex/superpowers` → new canonical path):
   ```bash
   if [ -d ~/.codex/superpowers ] && [ ! -d ~/.codex/superpowers-optimized ]; then
     mv ~/.codex/superpowers ~/.codex/superpowers-optimized
   fi
   ```

   **Windows (PowerShell):**
   ```powershell
   if ((Test-Path "$env:USERPROFILE\.codex\superpowers") -and -not (Test-Path "$env:USERPROFILE\.codex\superpowers-optimized")) {
     Rename-Item "$env:USERPROFILE\.codex\superpowers" "superpowers-optimized"
   }
   ```

3. **Recreate the skills symlink** pointing to the new path (step 2 above).

4. **(If using hooks) Enable `codex_hooks` in config** (step 3 above).

5. **(If using hooks) Enable/merge `~/.codex/hooks.json`** (step 4 above).

6. **Remove the old bootstrap block** from `~/.codex/AGENTS.md` — any block referencing `superpowers-codex bootstrap` is no longer needed.

7. **Restart Codex.**

## Migrating from old bootstrap

If you installed superpowers before native skill discovery, you need to:

1. **Update the repo:**
   ```bash
   cd ~/.codex/superpowers-optimized && git pull
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
cd ~/.codex/superpowers-optimized && git pull
```

**Windows (PowerShell):**
```powershell
Set-Location "$env:USERPROFILE\.codex\superpowers-optimized"; git pull
```

Skills update instantly through the symlink.

## Uninstalling

**Unix/macOS:**
```bash
rm ~/.agents/skills/superpowers
rm -rf ~/.codex/superpowers-optimized   # optional: delete the clone
```

**Windows (PowerShell):**
```powershell
cmd /c rmdir "$env:USERPROFILE\.agents\skills\superpowers"
Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\superpowers-optimized"   # optional: delete the clone
```
