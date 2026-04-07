#!/usr/bin/env node
/**
 * Codex SessionStart Adapter
 *
 * Runs at session start on Codex (macOS/Linux, hooks enabled).
 * Injects project context so the model has it from turn 1 without
 * waiting for the entry sequence to read files manually.
 *
 * What it does:
 *   1. Spawns context-engine.js to write/refresh context-snapshot.json
 *   2. Checks for plugin updates (git-based installs only, cached 24h)
 *   3. Assembles context: using-superpowers skill + project-map.md +
 *      session-log.md [saved] entries + state.md + known-issues.md +
 *      context-snapshot.json
 *   4. Outputs Codex hookSpecificOutput.additionalContext shape
 *
 * Separation rule: this file is Codex-only. Do not modify the Claude Code
 * session-start bash script to accommodate Codex.
 *
 * Input:  stdin JSON with { cwd, session_id, source, ... }
 * Output: stdout JSON with hookSpecificOutput.additionalContext
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const CACHE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.claude', 'hooks-logs');
const UPDATE_CACHE = path.join(CACHE_DIR, 'update-check.cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function runGit(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 4000, cwd, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

function isCacheStale() {
  try {
    const stat = fs.statSync(UPDATE_CACHE);
    return (Date.now() - stat.mtimeMs) >= CACHE_TTL_MS;
  } catch { return true; }
}

function touchCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(UPDATE_CACHE, new Date().toISOString());
  } catch {}
}

// ── Update check (git-based installs only) ───────────────────────────────────

function checkForUpdates() {
  try {
    const autoUpdate = (process.env.SUPERPOWERS_AUTO_UPDATE || '').toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(autoUpdate)) return '';

    // Only for git-based installs
    const gitDir = runGit('git rev-parse --git-dir', PLUGIN_ROOT);
    if (!gitDir) return '';

    if (!isCacheStale()) return '';

    const oldVersion = readFileSafe(path.join(PLUGIN_ROOT, 'VERSION')).trim();

    // Fetch origin — blocks up to 3s (acceptable for session-start; session is not
    // interactive until hooks complete). Fails silently on timeout or no network.
    try {
      execSync('git fetch origin --quiet', { cwd: PLUGIN_ROOT, timeout: 3000, stdio: 'ignore' });
    } catch { touchCache(); return ''; }

    touchCache();

    const localHead = runGit('git rev-parse HEAD', PLUGIN_ROOT);
    const remoteHead = runGit('git rev-parse origin/main', PLUGIN_ROOT);
    if (!localHead || !remoteHead || localHead === remoteHead) return '';

    // Bail if repo is dirty or local-ahead or diverged
    const dirty = runGit('git status --porcelain', PLUGIN_ROOT);
    if (dirty) return '';
    const base = runGit('git merge-base HEAD origin/main', PLUGIN_ROOT);
    if (base !== localHead) return '';

    // Apply fast-forward
    try {
      execSync('git merge --ff-only origin/main', { cwd: PLUGIN_ROOT, timeout: 5000, stdio: 'ignore' });
    } catch { return ''; }

    const newVersion = readFileSafe(path.join(PLUGIN_ROOT, 'VERSION')).trim();
    if (!newVersion || newVersion === oldVersion) return '';

    // Extract What's New from RELEASE-NOTES.md
    let whatsNew = '';
    const notes = readFileSafe(path.join(PLUGIN_ROOT, 'RELEASE-NOTES.md'));
    if (notes && oldVersion) {
      const start = notes.indexOf(`## v${newVersion}`);
      const end = notes.indexOf(`## v${oldVersion}`);
      if (start !== -1) {
        const raw = end !== -1 ? notes.slice(start, end) : notes.slice(start);
        const lines = raw.split('\n').slice(1); // skip version header
        whatsNew = lines.slice(0, 30).join('\n');
        if (lines.length > 30) whatsNew += '\n\n...See RELEASE-NOTES.md for full details.';
      }
    }

    return `\n\n<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER:\n\n**Superpowers Optimized has been updated to v${newVersion}** (was v${oldVersion})\n\n**What's New:**\n${whatsNew}\n</important-reminder>`;
  } catch { return ''; }
}

// ── Project file assembly ─────────────────────────────────────────────────────

function assembleProjectMap(cwd) {
  const filePath = path.join(cwd, 'project-map.md');
  const raw = readFileSafe(filePath);
  if (!raw) return '';

  const lines = raw.split('\n');
  let content;
  if (lines.length <= 200) {
    content = raw;
  } else {
    // Large map: extract Critical Constraints and Hot Files sections only
    const sections = [];
    let inSection = false;
    for (const line of lines) {
      if (/^## /.test(line)) {
        inSection = /^## (Critical Constraints|Hot Files)/.test(line);
      }
      if (inSection) sections.push(line);
    }
    content = sections.length > 0
      ? `*(project-map.md is large — showing Critical Constraints and Hot Files only. Full map at project-map.md)*\n\n${sections.join('\n')}`
      : '';
  }
  return content ? `\n\n<project-map>\n${content}\n</project-map>` : '';
}

function assembleSessionLog(cwd) {
  const filePath = path.join(cwd, 'session-log.md');
  const raw = readFileSafe(filePath);
  if (!raw) return '';

  // Extract last 2 [saved] entries (skip [auto] entries)
  const savedEntries = [];
  let current = null;
  for (const line of raw.split('\n')) {
    if (/^## .* \[saved\]/.test(line)) {
      if (current !== null) savedEntries.push(current);
      current = line;
    } else if (/^## /.test(line) && !/\[saved\]/.test(line)) {
      if (current !== null) { savedEntries.push(current); current = null; }
    } else if (current !== null) {
      current += '\n' + line;
    }
  }
  if (current !== null) savedEntries.push(current);

  const last2 = savedEntries.slice(-2).join('\n\n');
  return last2
    ? `\n\n<session-log>\n*(Last saved decisions from session-log.md — full history at session-log.md)*\n${last2}\n</session-log>`
    : '';
}

function assembleState(cwd) {
  const raw = readFileSafe(path.join(cwd, 'state.md'));
  return raw
    ? `\n\n<state>\n**ACTIVE TASK STATE — resume from here, do not start fresh:**\n${raw}\n</state>`
    : '';
}

function assembleKnownIssues(cwd) {
  const raw = readFileSafe(path.join(cwd, 'known-issues.md'));
  return raw ? `\n\n<known-issues>\n${raw}\n</known-issues>` : '';
}

function assembleContextSnapshot(cwd) {
  try {
    const snapshotPath = path.join(cwd, 'context-snapshot.json');
    const raw = readFileSafe(snapshotPath);
    if (!raw) return '';
    const s = JSON.parse(raw);
    const files = (s.changed_files || []).join(', ');
    const commits = (s.recent_commits || []).slice(0, 3).join('\n  ');
    if (!files) return '';
    return `\n\n<context-snapshot>\nChanged since last commit: ${files}\nRecent commits:\n  ${commits}\n</context-snapshot>`;
  } catch { return ''; }
}

function assembleUsingSuperpowers() {
  const skillPath = path.join(SKILLS_DIR, 'using-superpowers', 'SKILL.md');
  const raw = readFileSafe(skillPath);
  if (!raw) return 'Error reading using-superpowers skill';

  // Strip YAML frontmatter (--- delimiters)
  const lines = raw.split('\n');
  let inFrontmatter = false;
  let frontmatterDone = false;
  const body = [];
  for (const line of lines) {
    if (!frontmatterDone && line.trim() === '---') {
      if (!inFrontmatter) { inFrontmatter = true; continue; }
      else { frontmatterDone = true; continue; }
    }
    if (frontmatterDone) body.push(line);
  }
  return body.join('\n');
}

// ── Git notice (no repo detected) ────────────────────────────────────────────

function gitNotice(cwd) {
  const result = runGit('git rev-parse --git-dir', cwd);
  if (result) return '';
  return '\n\n<project-git-status>No git repository detected in the current working directory. When the user generates or updates project-map.md, offer to run \'git init\'. Do not announce this proactively — only act on it when project-map.md is relevant.</project-git-status>';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let cwd = process.cwd();
  try {
    const data = JSON.parse(input);
    if (data.cwd) cwd = data.cwd;
  } catch {}

  // Spawn context-engine.js in background — writes context-snapshot.json
  // Fire-and-forget: don't block session start on it
  const enginePath = path.join(__dirname, '..', 'context-engine.js');
  if (fs.existsSync(enginePath)) {
    try {
      const child = spawn(process.execPath, [enginePath], {
        cwd,
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: false,
      });
      child.unref();
    } catch {}
  }

  // Assemble all context pieces
  const updateNotice = checkForUpdates();
  const usingSuperpowers = assembleUsingSuperpowers();
  const projectMap = assembleProjectMap(cwd);
  const sessionLog = assembleSessionLog(cwd);
  const state = assembleState(cwd);
  const knownIssues = assembleKnownIssues(cwd);
  const contextSnapshot = assembleContextSnapshot(cwd);
  const git = gitNotice(cwd);

  const sessionContext = [
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
    usingSuperpowers,
    updateNotice,
    git,
    '</EXTREMELY_IMPORTANT>',
    projectMap,
    sessionLog,
    state,
    knownIssues,
    contextSnapshot,
  ].join('');

  // Output strategy: emit both plain text and hookSpecificOutput JSON.
  //
  // Codex docs say plain text on stdout is added as developer context.
  // hookSpecificOutput.additionalContext is the structured form.
  // Integration testing (T1.1) showed hookSpecificOutput alone was silently
  // discarded in codex-cli 0.118.0-alpha.2 — the model received only Codex's
  // own system context, not our additionalContext.
  //
  // Emitting plain text first ensures consumption regardless of whether
  // the runtime honours hookSpecificOutput on SessionStart.
  // The JSON object on the final line is parsed by runtimes that expect it.
  process.stdout.write(sessionContext);
  process.stdout.write('\n');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: sessionContext,
    },
  }));
}

main().catch(() => process.stdout.write('{}'));
