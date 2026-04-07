#!/usr/bin/env node
/**
 * Codex Stop Adapter
 *
 * Runs when a Codex turn ends. Generates lightweight discipline reminders
 * surfaced as a systemMessage (shown as a UI warning — non-blocking).
 *
 * Codex vs Claude Code differences:
 *   - Uses stop_hook_active payload field (not a file-based guard) to prevent loops
 *   - Uses systemMessage output (not additionalContext) — the correct Codex Stop shape
 *   - Cannot read edit-log.txt (no PostToolUse(Edit|Write) events on Codex)
 *   - Infers edited files from git uncommitted changes instead
 *
 * Reminders generated:
 *   - TDD: source files changed without test file changes
 *   - Commit: many files changed
 *   - Decision log: core skill/hook files changed without a [saved] session-log entry
 *   - Session-log size: last 2 [saved] entries exceed token budget
 *
 * Separation rule: this file is Codex-only. Claude Code's stop-reminders.js
 * remains unchanged.
 *
 * Input:  stdin JSON with { stop_hook_active, last_assistant_message, cwd, session_id, ... }
 * Output: stdout JSON — {} or { systemMessage: "..." }
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── File classification (mirrors stop-reminders.js patterns) ─────────────────

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /_test\.(go|py|rb)$/,
  /test_[^/]+\.py$/, /Tests?\.[^/]+$/, /__tests__\//,
];
const SOURCE_PATTERNS = [/\.(js|jsx|ts|tsx|py|rb|go|rs|java|cs|cpp|c|h|hpp|swift|kt|scala|php)$/];
const CONFIG_PATTERNS = [
  /package\.json$/, /tsconfig.*\.json$/, /\.eslintrc/, /\.prettierrc/,
  /\.gitignore$/, /\.env/, /Dockerfile/, /docker-compose/, /\.ya?ml$/,
  /\.toml$/, /\.cfg$/, /\.ini$/, /\.md$/, /\.lock$/, /CLAUDE\.md$/, /SKILL\.md$/,
];
const SIG_PATTERNS = [
  /SKILL\.md$/i, /[/\\]hooks[/\\][^/\\]+\.js$/, /[/\\]hooks[/\\]session-start$/,
  /skill-rules\.json$/, /CLAUDE\.md$/i, /agents[/\\][^/\\]+\.md$/i,
];

const isTestFile = f => TEST_PATTERNS.some(p => p.test(f));
const isSourceFile = f => SOURCE_PATTERNS.some(p => p.test(f)) && !CONFIG_PATTERNS.some(p => p.test(f));
const isSignificantFile = f => SIG_PATTERNS.some(p => p.test(f));

// ── Git helpers ───────────────────────────────────────────────────────────────

function runGit(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 3000, cwd, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

function getUncommittedFiles(cwd) {
  // Staged changes, unstaged modifications, and untracked new files
  const staged = runGit('git diff --name-only --cached', cwd);
  const unstaged = runGit('git diff --name-only', cwd);
  const untracked = runGit('git ls-files --others --exclude-standard', cwd);
  const combined = [staged, unstaged, untracked].filter(Boolean).join('\n');
  return [...new Set(combined.split('\n').filter(Boolean))];
}

// ── Session-log helpers ───────────────────────────────────────────────────────

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}


function checkSessionLogSize(cwd) {
  try {
    const log = readFileSafe(path.join(cwd, 'session-log.md'));
    if (!log) return null;
    const entries = [];
    let current = null;
    for (const line of log.split('\n')) {
      if (/^## .+\[saved\]/.test(line)) {
        if (current) entries.push(current);
        current = { header: line, chars: line.length + 1 };
      } else if (/^## .+\[auto\]/.test(line)) {
        if (current) { entries.push(current); current = null; }
      } else if (current) {
        current.chars += line.length + 1;
      }
    }
    if (current) entries.push(current);
    const last2 = entries.slice(-2);
    const HARD_CAP = 1000; // ~250 tokens
    const over = last2.filter(e => e.chars > HARD_CAP);
    if (over.length === 0) return null;
    const totalTokens = last2.reduce((s, e) => s + Math.round(e.chars / 4), 0);
    return (
      `Session-log size warning: last 2 [saved] entries inject ~${totalTokens} tokens per session ` +
      `(target: <300). Entries over budget: ${over.map(e => e.header.trim()).join('; ')}. ` +
      `Trim to: Goal / Decisions / Rejected / Open only.`
    );
  } catch { return null; }
}

// ── Reminder generation ───────────────────────────────────────────────────────

function generateReminders(cwd, changedFiles) {
  const reminders = [];

  if (changedFiles.length === 0) return reminders;

  const sourceFiles = changedFiles.filter(isSourceFile);
  const testFiles = changedFiles.filter(isTestFile);

  // TDD reminder: source files changed without test file changes
  if (sourceFiles.length > 0 && testFiles.length === 0) {
    reminders.push(
      `TDD reminder: ${sourceFiles.length} source file(s) modified without test changes. ` +
      `Consider running tests or invoking the test-driven-development skill if behavior changed.`
    );
  }

  // Commit reminder: many files changed
  if (changedFiles.length >= 5) {
    reminders.push(
      `Commit reminder: ${changedFiles.length} files with uncommitted changes. ` +
      `Consider committing incremental progress to avoid losing work.`
    );
  }

  // Decision log: significant files (skills, hooks, config) are in uncommitted changes.
  // Fire regardless of whether a prior [saved] entry exists — the point is that
  // THIS session's changes to core files haven't been documented yet.
  const sigFiles = changedFiles.filter(isSignificantFile);
  if (sigFiles.length > 0) {
    reminders.push(
      `Decision log: Core skill/hook/config files were modified (${sigFiles.map(f => path.basename(f)).join(', ')}). ` +
      `Before stopping, invoke the context-management skill to write a [saved] entry ` +
      `capturing decisions and rationale. Future sessions start with zero context.`
    );
  }

  // Session-log size warning
  const sizeWarning = checkSessionLogSize(cwd);
  if (sizeWarning) reminders.push(sizeWarning);

  return reminders;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);

    // stop_hook_active = true means this Stop was triggered by a previous hook's
    // continuation. Don't fire reminders — that would cause an infinite loop.
    if (data.stop_hook_active === true) {
      process.stdout.write('{}');
      return;
    }

    const cwd = data.cwd || process.cwd();

    // Not a git repo → nothing to infer about changed files
    const gitDir = runGit('git rev-parse --git-dir', cwd);
    if (!gitDir) {
      process.stdout.write('{}');
      return;
    }

    const changedFiles = getUncommittedFiles(cwd);
    const reminders = generateReminders(cwd, changedFiles);

    if (reminders.length === 0) {
      process.stdout.write('{}');
      return;
    }

    // systemMessage: shown as a UI warning in Codex — non-blocking, no continuation
    const message = [
      'Superpowers reminders:',
      ...reminders.map((r, i) => `${i + 1}. ${r}`),
    ].join('\n');

    process.stdout.write(JSON.stringify({ systemMessage: message }));
  } catch {
    process.stdout.write('{}');
  }
}

main();
