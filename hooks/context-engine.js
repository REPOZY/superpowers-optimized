#!/usr/bin/env node
/**
 * SessionStart Hook — Context Engine
 *
 * Runs on every session start. Executes git commands to compute:
 *   - Recently changed files (last commit)
 *   - Blast radius: tracked files whose reference to a changed file actually
 *     resolves to that file's path. Word-level matches are never counted.
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
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_FILES = 10;    // cap blast radius queries to avoid slowness on large diffs
const MIN_NAME_LEN = 3;  // skip very short filenames to avoid false-positive grep hits
const TIMEOUT_MS = 5000; // max time for any single git command

// Cross-session watermark: stores the HEAD hash from the previous session start
// so the next session can diff against it and show everything that changed since.
// Per-project: hashes the cwd so multi-project users don't clobber each other's watermarks.
function getLastHeadFile(cwd) {
  const hash = createHash('md5').update(cwd).digest('hex').slice(0, 12);
  return path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.claude', 'hooks-logs', `last-session-head-${hash}.txt`
  );
}

// Generic basenames that match too many files and produce noisy blast radius results
const BASENAME_DENYLIST = new Set([
  'index', 'main', 'test', 'tests', 'spec', 'utils', 'util', 'helpers', 'helper',
  'config', 'setup', 'app', 'types', 'constants', 'common', 'shared', 'lib', 'mod',
  // Added after measuring: these produced the worst false positives.
  // "SKILL.md" claimed 21 dependents, ".claude-plugin/plugin.json" claimed 16 —
  // every file that merely used the word "skill" or "plugin" in prose.
  'skill', 'plugin', 'version', 'readme', 'changelog', 'license', 'package',
  'manifest', 'schema', 'model', 'client', 'server', 'core', 'base',
]);

// Extensions stripped when comparing a reference to a file path, so that
// "./foo", "./foo.js" and "./foo/index.js" all normalise to the same target.
const MODULE_EXTENSIONS = [
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.php', '.cs',
  '.json', '.yaml', '.yml', '.md', '.sh',
];

/** Normalise a path for comparison: forward slashes, no extension, no /index. */
function normalizeTarget(p) {
  let out = p.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const ext of MODULE_EXTENSIONS) {
    if (out.toLowerCase().endsWith(ext)) {
      out = out.slice(0, -ext.length);
      break;
    }
  }
  return out.replace(/\/index$/, '');
}

/**
 * Extract path-like tokens from a source line that could refer to `basename`.
 * Quotes, backticks, parentheses and trailing punctuation are stripped.
 */
function extractPathTokens(line, basename) {
  const tokens = [];
  const re = /[A-Za-z0-9_@.\-/\\]+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const raw = m[0].replace(/[.,;:)\]}]+$/, '');
    if (raw.toLowerCase().includes(basename.toLowerCase())) tokens.push(raw);
  }
  return tokens;
}

/**
 * Does `line` in `fromFile` contain a reference that actually resolves to
 * `changedFile`? This is the whole point of the rewrite: an edge is kept only
 * when the reference can be resolved to the changed file's real path. A bare
 * word that merely matches the basename is not evidence and is dropped.
 */
function referenceResolves(line, fromFile, changedFile, basename) {
  const target = normalizeTarget(changedFile);
  const fromDir = path.posix.dirname(fromFile.replace(/\\/g, '/'));

  for (const token of extractPathTokens(line, basename)) {
    // A reference must carry a path separator. A bare token — even one that
    // looks like a filename ("SKILL.md") — cannot identify *which* file is
    // meant, and counting it is how the old implementation invented dependents.
    // Under-reporting is the correct failure direction here.
    if (!token.includes('/') && !token.includes('\\')) continue;

    const normalized = token.replace(/\\/g, '/');

    // Relative specifier resolved against the referencing file's directory.
    if (normalized.startsWith('./') || normalized.startsWith('../')) {
      const resolved = path.posix.normalize(path.posix.join(fromDir, normalized));
      if (normalizeTarget(resolved) === target) return true;
      continue;
    }

    // Repo-relative or suffix reference (docs and configs use these).
    const norm = normalizeTarget(normalized.replace(/^\/+/, ''));
    if (norm === target || target.endsWith('/' + norm)) return true;
  }

  return false;
}

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
  const lastHeadFile = getLastHeadFile(cwd);

  // Cross-session watermark: read BEFORE computing changedFiles so we can use
  // it as the diff base when available (shows all changes since last session,
  // not just the last commit).
  let lastHead = '';
  let mergeBase = '';
  let crossSessionFiles = [];
  let crossSessionCommitCount = 0;
  try {
    lastHead = fs.existsSync(lastHeadFile)
      ? fs.readFileSync(lastHeadFile, 'utf8').trim()
      : '';
    if (lastHead && lastHead !== gitHash) {
      // Confirm lastHead is an ancestor of HEAD (merge-base returns it if so)
      mergeBase = run(`git merge-base ${lastHead} HEAD`, cwd);
      if (mergeBase === lastHead) {
        const crossRaw = run(`git diff --name-only ${lastHead}..HEAD`, cwd);
        crossSessionFiles = crossRaw ? crossRaw.split('\n').filter(Boolean) : [];
        const logRaw2 = run(`git log --oneline ${lastHead}..HEAD`, cwd);
        crossSessionCommitCount = logRaw2 ? logRaw2.split('\n').filter(Boolean).length : 0;
      }
    }
  } catch {
    // Silent — never block session start
  }

  // Changed files: use cross-session watermark as diff base when available
  // (shows everything since last session). Falls back to HEAD~1 on first session.
  const useWatermark = lastHead && lastHead !== gitHash && mergeBase === lastHead;
  const diffBase = useWatermark ? lastHead : 'HEAD~1';
  const changedRaw = run(`git diff --name-only ${diffBase}..HEAD`, cwd);
  const changedFiles = changedRaw ? changedRaw.split('\n').filter(Boolean) : [];

  // Change statistics
  const statOutput = run(`git diff --stat ${diffBase}..HEAD`, cwd);
  const changeStat = statOutput ? statOutput.split('\n').pop() : '';

  // Recent commits
  const logRaw = run('git log --oneline -5', cwd);
  const recentCommits = logRaw ? logRaw.split('\n').filter(Boolean) : [];

  // Persist current HEAD as watermark for the next session
  try {
    fs.mkdirSync(path.dirname(lastHeadFile), { recursive: true });
    fs.writeFileSync(lastHeadFile, gitHash);
  } catch {
    // Silent
  }

  // Blast radius: for each changed file, find tracked files that reference it.
  //
  // Every edge must be *path-resolved*. The previous implementation kept any file
  // containing the basename as a word, which produced 21 fabricated "dependents"
  // for skills/brainstorming/SKILL.md and 16 for .claude-plugin/plugin.json —
  // and requesting-code-review feeds this list straight into the reviewer's scope.
  // An empty list is honest; a wrong one teaches the reviewer to ignore the field.
  const blastRadius = {};
  for (const file of changedFiles.slice(0, MAX_FILES)) {
    const basename = path.basename(file, path.extname(file));
    if (basename.length < MIN_NAME_LEN) continue;
    if (BASENAME_DENYLIST.has(basename.toLowerCase())) continue;

    // Strip characters that could break the grep pattern
    const safeName = basename.replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!safeName) continue;

    // One grep with line content — cheaper than the old grep-per-candidate loop.
    const hits = run(
      `git grep -n "${safeName}" -- ":(exclude)*.lock" ":(exclude)package-lock.json" ":(exclude)*.min.js" ":(exclude)*.map"`,
      cwd
    );
    if (!hits) {
      blastRadius[file] = [];
      continue;
    }

    const dependents = new Set();
    for (const hit of hits.split('\n')) {
      if (!hit) continue;
      // Format: path:lineNumber:content
      const firstColon = hit.indexOf(':');
      if (firstColon < 0) continue;
      const secondColon = hit.indexOf(':', firstColon + 1);
      if (secondColon < 0) continue;

      const refFile = hit.slice(0, firstColon);
      const content = hit.slice(secondColon + 1);
      if (!refFile || refFile === file) continue;
      if (dependents.has(refFile)) continue;

      if (referenceResolves(content, refFile, file, safeName)) {
        dependents.add(refFile);
      }
    }

    blastRadius[file] = [...dependents];
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    git_hash: gitHash,
    changed_files: changedFiles,
    change_stat: changeStat,
    recent_commits: recentCommits,
    blast_radius: blastRadius,
    // Consumers must know how much to trust the edges above.
    blast_radius_method: 'path-resolved',
    cross_session_files: crossSessionFiles,
    cross_session_commit_count: crossSessionCommitCount,
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

if (require.main === module) {
  main();
} else {
  module.exports = {
    normalizeTarget,
    extractPathTokens,
    referenceResolves,
    BASENAME_DENYLIST,
    MODULE_EXTENSIONS,
  };
}
