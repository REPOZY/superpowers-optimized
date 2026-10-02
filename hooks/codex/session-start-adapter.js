#!/usr/bin/env node
/**
 * Codex SessionStart Adapter
 *
 * Injects project context as plain-text developer context on SessionStart.
 * Codex accepts plain text on stdout for this event, so this adapter avoids
 * the mixed plain-text + JSON strategy that proved unreliable in live runs.
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  getSuperpowersConfigDir,
  isAutoUpdateDisabled,
  readFileSafe,
  readJsonStdin,
} = require('./utils');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const UPDATE_CACHE = path.join(getSuperpowersConfigDir(), 'update-check.cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function runGit(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 4000, cwd, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (error) {
    const stdout = typeof error?.stdout === 'string'
      ? error.stdout
      : Buffer.isBuffer(error?.stdout)
        ? error.stdout.toString('utf8')
        : '';
    if (stdout && error?.status === 0) return stdout.trim();
    return '';
  }
}

function isCacheStale() {
  try {
    const stat = fs.statSync(UPDATE_CACHE);
    return (Date.now() - stat.mtimeMs) >= CACHE_TTL_MS;
  } catch {
    return true;
  }
}

function touchCache() {
  try {
    fs.mkdirSync(path.dirname(UPDATE_CACHE), { recursive: true });
    fs.writeFileSync(UPDATE_CACHE, new Date().toISOString());
  } catch {}
}

function checkForUpdates() {
  try {
    if (isAutoUpdateDisabled()) return '';

    const gitDir = runGit('git rev-parse --git-dir', PLUGIN_ROOT);
    if (!gitDir) return '';
    if (!isCacheStale()) return '';

    const oldVersion = readFileSafe(path.join(PLUGIN_ROOT, 'VERSION')).trim();

    try {
      execSync('git fetch origin --quiet', { cwd: PLUGIN_ROOT, timeout: 3000, stdio: 'ignore' });
    } catch {
      touchCache();
      return '';
    }

    touchCache();

    const localHead = runGit('git rev-parse HEAD', PLUGIN_ROOT);
    const remoteHead = runGit('git rev-parse origin/main', PLUGIN_ROOT);
    if (!localHead || !remoteHead || localHead === remoteHead) return '';

    const dirty = runGit('git status --porcelain', PLUGIN_ROOT);
    if (dirty) return '';

    const base = runGit('git merge-base HEAD origin/main', PLUGIN_ROOT);
    if (base !== localHead) return '';

    try {
      execSync('git merge --ff-only origin/main', { cwd: PLUGIN_ROOT, timeout: 5000, stdio: 'ignore' });
    } catch {
      return '';
    }

    const newVersion = readFileSafe(path.join(PLUGIN_ROOT, 'VERSION')).trim();
    if (!newVersion || newVersion === oldVersion) return '';

    let whatsNew = '';
    const notes = readFileSafe(path.join(PLUGIN_ROOT, 'RELEASE-NOTES.md'));
    if (notes && oldVersion) {
      const start = notes.indexOf(`## v${newVersion}`);
      const end = notes.indexOf(`## v${oldVersion}`);
      if (start !== -1) {
        const raw = end !== -1 ? notes.slice(start, end) : notes.slice(start);
        const lines = raw.split('\n').slice(1);
        whatsNew = lines.slice(0, 30).join('\n');
        if (lines.length > 30) whatsNew += '\n\n...See RELEASE-NOTES.md for full details.';
      }
    }

    return `\n\n<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER:\n\n**Superpowers Optimized has been updated to v${newVersion}** (was v${oldVersion})\n\n**What's New:**\n${whatsNew}\n</important-reminder>`;
  } catch {
    return '';
  }
}

// Project memory comes from the same builder the Claude Code hook uses, so the
// two injectors cannot drift apart (they had: no state gate, raw known-issues,
// a false snapshot label).
const { buildMemory } = require('../session-memory');

/**
 * Mirrors hooks/session-start: drop the router section that does not apply to
 * this project (fresh-project gate when a map exists, map-staleness procedure
 * when none does) and always remove the markers.
 */
function filterConditionalSections(text, hasMap) {
  const out = [];
  let skip = false;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '<!-- sp:if-project-map -->') { skip = !hasMap; continue; }
    if (t === '<!-- sp:if-no-project-map -->') { skip = hasMap; continue; }
    if (/^<!-- \/sp:if-(no-)?project-map -->$/.test(t)) { skip = false; continue; }
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

function assembleUsingSuperpowers(cwd) {
  const skillPath = path.join(SKILLS_DIR, 'using-superpowers', 'SKILL.md');
  const raw = readFileSafe(skillPath);
  if (!raw) return 'Error reading using-superpowers skill';

  const hasMap = Boolean(cwd) && fs.existsSync(path.join(cwd, 'project-map.md'));
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return filterConditionalSections(raw, hasMap);

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  const body = endIndex === -1 ? raw : lines.slice(endIndex + 1).join('\n').trim();
  return filterConditionalSections(body, hasMap);
}

function gitNotice(cwd) {
  const result = runGit('git rev-parse --git-dir', cwd);
  if (result) return '';
  return '\n\n<project-git-status>No git repository detected in the current working directory. When the user generates or updates project-map.md, offer to run \'git init\'. Do not announce this proactively — only act on it when project-map.md is relevant.</project-git-status>';
}

function spawnContextEngine(cwd) {
  const enginePath = path.join(__dirname, '..', 'context-engine.js');
  if (!fs.existsSync(enginePath)) return;

  try {
    const child = spawn(process.execPath, [enginePath], {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: false,
    });
    child.unref();
  } catch {}
}

function memoryBlock(cwd) {
  const { text } = buildMemory(cwd);
  return text ? `\n\n${text}` : '';
}

function buildSessionContext(cwd) {
  return [
    '<EXTREMELY_IMPORTANT>',
    'You have superpowers-optimized.',
    '',
    '**The `superpowers-optimized:using-superpowers` guidance is loaded below. For all other skills, use the `Skill` tool.**',
    '',
    '**MANDATORY FIRST ACTIONS — before ANY tool calls beyond reading files:**',
    '1. Silently activate token-efficiency (its rules apply immediately)',
    '2. Classify the task complexity (micro/lightweight/full) per the Entry Sequence below',
    '3. If the user names a specific skill (e.g. use brainstorming, use context management), that IS a Skill tool invocation — call `Skill` with that skill name. Do NOT re-implement the skill\'s purpose with ad-hoc agents or manual steps.',
    '',
    assembleUsingSuperpowers(cwd),
    checkForUpdates(),
    gitNotice(cwd),
    '</EXTREMELY_IMPORTANT>',
    memoryBlock(cwd),
  ].join('');
}

function main() {
  const data = readJsonStdin();
  const cwd = data && typeof data.cwd === 'string' && data.cwd ? data.cwd : process.cwd();

  spawnContextEngine(cwd);

  process.stdout.write(buildSessionContext(cwd));
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    memoryBlock,
    assembleUsingSuperpowers,
    buildSessionContext,
    filterConditionalSections,
    checkForUpdates,
    gitNotice,
    main,
  };
}
