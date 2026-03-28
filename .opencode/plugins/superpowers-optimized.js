/**
 * Superpowers plugin for OpenCode.ai
 *
 * Injects superpowers bootstrap context via system prompt transform.
 * Skills are discovered via OpenCode's native skill tool from symlinked directory.
 * Performs a best-effort git-based auto-update once per 24 hours.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPDATE_CACHE_TTL_SECONDS = 86400;
const UPDATE_CONFIG_FILE = path.join('.config', 'superpowers', 'update.conf');

// Simple frontmatter extraction (avoid dependency on skills-core for bootstrap)
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };

  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: body };
};

// Normalize a path: trim whitespace, expand ~, resolve to absolute
const normalizePath = (p, homeDir) => {
  if (!p || typeof p !== 'string') return null;
  let normalized = p.trim();
  if (!normalized) return null;
  if (normalized.startsWith('~/')) {
    normalized = path.join(homeDir, normalized.slice(2));
  } else if (normalized === '~') {
    normalized = homeDir;
  }
  return path.resolve(normalized);
};

const runGit = (repoRoot, args, timeoutMs = 0) => {
  try {
    const result = spawnSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      timeout: timeoutMs > 0 ? timeoutMs : undefined
    });
    if (result.error) {
      return { ok: false, stdout: '', stderr: String(result.error.message || result.error) };
    }
    return {
      ok: result.status === 0,
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim()
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: String(err) };
  }
};

const parseBooleanLike = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const isAutoUpdateEnabled = (homeDir) => {
  const envSetting = parseBooleanLike(process.env.SUPERPOWERS_AUTO_UPDATE || '');
  if (envSetting !== null) return envSetting;

  const configFile = path.join(homeDir, UPDATE_CONFIG_FILE);
  if (!fs.existsSync(configFile)) return true;

  try {
    const lines = fs.readFileSync(configFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^auto_update\s*=\s*(.+)$/i);
      if (!match) continue;
      const parsed = parseBooleanLike(match[1] || '');
      if (parsed !== null) return parsed;
    }
  } catch {
    // Ignore parse/read failures and keep the default enabled behavior.
  }

  return true;
};

const readVersion = (pluginRoot) => {
  try {
    const versionPath = path.join(pluginRoot, 'VERSION');
    return fs.readFileSync(versionPath, 'utf8').trim();
  } catch {
    return '';
  }
};

const readWhatsNew = (pluginRoot, newVersion, oldVersion) => {
  const releaseNotesPath = path.join(pluginRoot, 'RELEASE-NOTES.md');
  if (!fs.existsSync(releaseNotesPath)) return '';

  let content = '';
  try {
    content = fs.readFileSync(releaseNotesPath, 'utf8');
  } catch {
    return '';
  }

  const lines = content.split(/\r?\n/);
  const startHeading = `## v${newVersion}`;
  const stopHeading = `## v${oldVersion}`;
  const startIndex = lines.findIndex((line) => line.startsWith(startHeading));
  if (startIndex < 0) return '';

  const extracted = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith(stopHeading)) break;
    extracted.push(line);
  }

  while (extracted.length > 0 && extracted[0].trim() === '') extracted.shift();
  while (extracted.length > 0 && extracted[extracted.length - 1].trim() === '') extracted.pop();

  if (extracted.length > 30) {
    return `${extracted.slice(0, 30).join('\n')}\n...\n\nSee RELEASE-NOTES.md for full details.`;
  }
  return extracted.join('\n');
};

const checkForUpdates = (pluginRoot, configDir, homeDir) => {
  const cacheDir = path.join(configDir, 'hooks-logs');
  const cacheFile = path.join(cacheDir, 'update-check.cache');
  const nowMs = Date.now();

  if (!isAutoUpdateEnabled(homeDir)) return '';

  // Must be a git repo to auto-update.
  const gitDir = runGit(pluginRoot, ['rev-parse', '--git-dir']);
  if (!gitDir.ok) return '';

  // Skip checks while cache is fresh.
  try {
    const stat = fs.statSync(cacheFile);
    const cacheAgeSeconds = Math.floor((nowMs - stat.mtimeMs) / 1000);
    if (cacheAgeSeconds < UPDATE_CACHE_TTL_SECONDS) return '';
  } catch {
    // Cache file doesn't exist or cannot be read; proceed with update check.
  }

  const fetchResult = runGit(pluginRoot, ['fetch', 'origin', '--quiet'], 3000);
  if (!fetchResult.ok) return '';

  const localHead = runGit(pluginRoot, ['rev-parse', 'HEAD']);
  const remoteHead = runGit(pluginRoot, ['rev-parse', 'origin/main']);
  if (!localHead.ok || !remoteHead.ok || !localHead.stdout || !remoteHead.stdout) return '';

  // Update cache timestamp regardless of whether an update was needed.
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, `${nowMs}\n`);
  } catch {
    // Cache write failure should never block normal plugin behavior.
  }

  if (localHead.stdout === remoteHead.stdout) return '';

  // Never auto-update if the plugin clone has local changes.
  const dirtyStatus = runGit(pluginRoot, ['status', '--porcelain']);
  if (!dirtyStatus.ok || dirtyStatus.stdout) return '';

  // Only fast-forward from local HEAD to origin/main.
  // Skip local-ahead/diverged states to avoid destructive sync.
  const mergeBase = runGit(pluginRoot, ['merge-base', 'HEAD', 'origin/main']);
  if (!mergeBase.ok || mergeBase.stdout !== localHead.stdout) return '';

  const oldVersion = readVersion(pluginRoot);
  const mergeResult = runGit(pluginRoot, ['merge', '--ff-only', 'origin/main']);
  if (!mergeResult.ok) return '';

  const newVersion = readVersion(pluginRoot);
  if (!oldVersion || !newVersion || oldVersion === newVersion) return '';

  const whatsNew = readWhatsNew(pluginRoot, newVersion, oldVersion);
  return `<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER:

**Superpowers Optimized has been updated to v${newVersion}** (was v${oldVersion})

**What's New:**
${whatsNew}</important-reminder>`;
};

export const SuperpowersPlugin = async ({ client, directory }) => {
  const homeDir = os.homedir();
  const pluginRoot = path.resolve(__dirname, '../..');
  const superpowersSkillsDir = path.resolve(__dirname, '../../skills');
  const envConfigDir = normalizePath(process.env.OPENCODE_CONFIG_DIR, homeDir);
  const configDir = envConfigDir || path.join(homeDir, '.config/opencode');
  const updateNotice = checkForUpdates(pluginRoot, configDir, homeDir);

  // Build bootstrap once to avoid per-request file I/O and string work.
  const bootstrapContent = (() => {
    const skillPath = path.join(superpowersSkillsDir, 'using-superpowers', 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;

    const fullContent = fs.readFileSync(skillPath, 'utf8');
    const { content } = extractAndStripFrontmatter(fullContent);

    const toolMapping = `**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`update_plan\`
- \`Task\` tool with subagents → Use OpenCode's subagent system (@mention)
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Your native tools

**Skills location:**
Superpowers skills are in \`${configDir}/skills/superpowers/\`
Use OpenCode's native \`skill\` tool to list and load skills.`;

    const updateSection = updateNotice ? `\n\n${updateNotice}\n` : '';

    return `<EXTREMELY_IMPORTANT>
You have superpowers-optimized.

**The \`using-superpowers\` guidance below is already loaded. Do not load it again.**

${content}
${updateSection}
${toolMapping}
</EXTREMELY_IMPORTANT>`;
  })();

  return {
    // Use system prompt transform to inject bootstrap (fixes #226 agent reset bug)
    'experimental.chat.system.transform': async (_input, output) => {
      if (bootstrapContent) {
        (output.system ||= []).push(bootstrapContent);
      }
    }
  };
};
