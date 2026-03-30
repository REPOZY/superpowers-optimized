#!/usr/bin/env node
/**
 * SessionStart Hook — Context Engine
 *
 * Runs on every session start. Executes git commands to compute:
 *   - Recently changed files (last commit)
 *   - Blast radius: which tracked files reference each changed file
 *   - Recent commit history and change statistics
 *
 * Writes context-snapshot.json to the project root.
 * Auto-adds context-snapshot.json to .gitignore on first write.
 * Fails silently on any error — never blocks session start.
 *
 * Input:  stdin JSON with { cwd, ... } (falls back to process.cwd())
 * Output: stdout {} always
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_FILES = 10;    // cap blast radius queries to avoid slowness on large diffs
const MIN_NAME_LEN = 3;  // skip very short filenames to avoid false-positive grep hits
const TIMEOUT_MS = 5000; // max time for any single git command

// Generic basenames that match too many files and produce noisy blast radius results
const BASENAME_DENYLIST = new Set([
  'index', 'main', 'test', 'tests', 'spec', 'utils', 'util', 'helpers', 'helper',
  'config', 'setup', 'app', 'types', 'constants', 'common', 'shared', 'lib', 'mod',
]);

function run(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: TIMEOUT_MS, cwd }).trim();
  } catch {
    return '';
  }
}

function ensureGitignored(cwd) {
  try {
    const gitignorePath = path.join(cwd, '.gitignore');
    let content = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf8')
      : '';

    const lines = content.split('\n').map(l => l.trim());
    if (lines.includes('context-snapshot.json')) return; // already present

    const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    const hasSection = content.includes('# AI assistant artifacts');

    if (!hasSection) {
      fs.appendFileSync(gitignorePath, `${prefix}\n# AI assistant artifacts\ncontext-snapshot.json\n`);
    } else {
      fs.appendFileSync(gitignorePath, `${prefix}context-snapshot.json\n`);
    }
  } catch {
    // Silently ignore — never block session start
  }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let cwd;
  try {
    const data = JSON.parse(input);
    cwd = data.cwd || process.cwd();
  } catch {
    cwd = process.cwd();
  }

  // Bail silently if not a git repo
  const gitDir = run('git rev-parse --git-dir', cwd);
  if (!gitDir) {
    process.stdout.write('{}');
    return;
  }

  const gitHash = run('git rev-parse HEAD', cwd);

  // Changed files in last commit
  const changedRaw = run('git diff --name-only HEAD~1..HEAD', cwd);
  const changedFiles = changedRaw ? changedRaw.split('\n').filter(Boolean) : [];

  // Change statistics — last line of --stat output is the summary
  const statOutput = run('git diff --stat HEAD~1..HEAD', cwd);
  const changeStat = statOutput ? statOutput.split('\n').pop() : '';

  // Recent commits
  const logRaw = run('git log --oneline -5', cwd);
  const recentCommits = logRaw ? logRaw.split('\n').filter(Boolean) : [];

  // Blast radius: for each changed file, find all tracked files that reference it by name
  const blastRadius = {};
  for (const file of changedFiles.slice(0, MAX_FILES)) {
    const basename = path.basename(file, path.extname(file));
    if (basename.length < MIN_NAME_LEN) continue;
    if (BASENAME_DENYLIST.has(basename.toLowerCase())) continue;

    // Strip characters that could break the grep pattern
    const safeName = basename.replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!safeName) continue;

    const refs = run(
      `git grep -l "${safeName}" -- ":(exclude)*.lock" ":(exclude)package-lock.json" ":(exclude)*.min.js" ":(exclude)*.map"`,
      cwd
    );
    blastRadius[file] = refs
      ? refs.split('\n').filter(f => f && f !== file)
      : [];
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    git_hash: gitHash,
    changed_files: changedFiles,
    change_stat: changeStat,
    recent_commits: recentCommits,
    blast_radius: blastRadius,
  };

  try {
    fs.writeFileSync(
      path.join(cwd, 'context-snapshot.json'),
      JSON.stringify(snapshot, null, 2)
    );
    ensureGitignored(cwd);
  } catch {
    // Silently ignore write errors — never block session start
  }

  process.stdout.write('{}');
}

main();
