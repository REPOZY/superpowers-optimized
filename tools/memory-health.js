#!/usr/bin/env node
/**
 * Memory stack health report.
 *
 * Answers the three questions you cannot tune the memory system without:
 *   1. Capture   — are significant sessions actually producing [saved] entries?
 *   2. Map trust — does project-map.md still describe files that exist and
 *                  have not changed since it was written?
 *   3. Budget    — how many tokens do the memory artifacts inject per session?
 *
 * Read-only. No dependencies. Never writes anything.
 *
 * Usage:
 *   node tools/memory-health.js [project-dir]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectDir = path.resolve(process.argv[2] || process.cwd());

const LOG_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '.',
  '.claude',
  'hooks-logs'
);

// Mirrors stop-reminders.js — keep in sync or the capture estimate drifts.
const SOURCE_RE = /\.(js|jsx|ts|tsx|py|rb|go|rs|java|cs|cpp|c|h|hpp|swift|kt|scala|php)$/;
const CONFIG_RE = /(package\.json|tsconfig.*\.json|\.eslintrc|\.prettierrc|\.gitignore|\.env|Dockerfile|docker-compose|\.ya?ml|\.toml|\.cfg|\.ini|\.md|\.lock)$/;
const SIGNIFICANT_SOURCE_FILE_COUNT = 4;

const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const tokens = s => Math.round((s || '').length / 4);
const isSource = f => SOURCE_RE.test(f) && !CONFIG_RE.test(f);

/** Compare filesystem paths case- and separator-insensitively (Windows drive
 *  letters differ between the edit log and path.resolve). */
const normPath = p => String(p).replace(/\\/g, '/').toLowerCase();
const underProject = f => normPath(f).startsWith(normPath(projectDir) + '/');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: projectDir, encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

const out = [];
const warn = [];
const line = (label, value) => out.push(`  ${String(label).padEnd(38)} ${value}`);

// ── 1. session-log.md ────────────────────────────────────────────────────────
out.push('\nsession-log.md');
const logRaw = read(path.join(projectDir, 'session-log.md'));
let savedHeaders = [];
if (!logRaw) {
  line('status', 'absent — no decision history is being kept');
  warn.push('No session-log.md. Every session starts without the "why" behind past decisions.');
} else {
  const lines = logRaw.split('\n');
  savedHeaders = lines.filter(l => /^## .+\[saved\]/.test(l));
  const superseded = savedHeaders.filter(l => /\[superseded/.test(l));
  const live = savedHeaders.filter(l => !/\[superseded/.test(l));

  // Entry sizes, to catch the injection budget creeping up.
  const entries = [];
  let cur = null;
  for (const l of lines) {
    if (/^## /.test(l)) { if (cur) entries.push(cur); cur = { header: l, chars: l.length }; }
    else if (cur) cur.chars += l.length + 1;
  }
  if (cur) entries.push(cur);
  const oversized = entries.filter(e => e.chars > 1500);

  const dates = savedHeaders
    .map(l => (l.match(/\d{4}-\d{2}-\d{2}/) || [])[0])
    .filter(Boolean)
    .sort();

  line('entries', `${savedHeaders.length} total (${live.length} live, ${superseded.length} superseded)`);
  line('date range', dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : 'unknown');
  line('injected per session (last 2 live)',
    `~${entries.slice(-2).reduce((s, e) => s + tokens('x'.repeat(e.chars)), 0)} tokens`);
  line('entries over the 1500-char cap', oversized.length);
  if (oversized.length) {
    warn.push(`${oversized.length} session-log entries exceed the size cap: ` +
      oversized.slice(0, 3).map(e => e.header.trim()).join('; '));
  }
  if (savedHeaders.length > 200) {
    warn.push('session-log.md is over 200 entries — prune entries older than 6 months.');
  }
}

// ── 2. Capture rate ──────────────────────────────────────────────────────────
// Approximation: the edit log knows which sessions were significant; the session
// log knows how many were written up. They cannot be joined exactly (entries are
// dated, edits are session-scoped), so treat this as a trend, not a precise rate.
out.push('\ncapture (approximate)');
const editLog = read(path.join(LOG_DIR, 'edit-log.txt'));
if (!editLog) {
  line('status', 'no edit-log.txt — cannot estimate');
} else {
  const bySession = new Map();
  for (const l of editLog.split('\n').filter(Boolean)) {
    const parts = l.split(' | ');
    if (parts.length < 4) continue;
    const [timestamp, sessionId, , filePath] = [parts[0], parts[1], parts[2], parts.slice(3).join(' | ')];
    if (!sessionId || !underProject(filePath)) continue;
    if (!bySession.has(sessionId)) bySession.set(sessionId, { files: new Set(), first: timestamp });
    bySession.get(sessionId).files.add(filePath);
  }
  const significant = [...bySession.values()].filter(
    s => [...s.files].filter(isSource).length >= SIGNIFICANT_SOURCE_FILE_COUNT
  );
  line('sessions seen in this project', bySession.size);
  line('that met the significance bar', significant.length);
  line('[saved] entries in the log', savedHeaders.length);
  if (significant.length > savedHeaders.length * 2 && significant.length > 2) {
    warn.push('Significant sessions substantially outnumber [saved] entries — ' +
      'decisions are being made and not recorded.');
  }
}

// ── 3. project-map.md trust ──────────────────────────────────────────────────
out.push('\nproject-map.md');
const mapRaw = read(path.join(projectDir, 'project-map.md'));
if (!mapRaw) {
  line('status', 'absent — sessions re-explore structure from scratch');
} else {
  const mapLines = mapRaw.split('\n').length;
  line('size', `${mapLines} lines (target 150, hard limit 200), ~${tokens(mapRaw)} tokens/session`);
  if (mapLines > 200) warn.push('project-map.md is over 200 lines — Key Files are no longer injected.');
  else if (mapLines > 150) warn.push('project-map.md is over the 150-line target — prune obvious entries.');

  // Documented paths: tokens containing a slash AND a file extension. Prose
  // fragments like "CMD/bash" or "120K/200K" also contain slashes, so requiring
  // an extension is what separates a path reference from an English phrase.
  const documented = [...new Set(
    (mapRaw.match(/[A-Za-z0-9_@.\-]+(?:\/[A-Za-z0-9_@.\-]+)+/g) || [])
      .map(t => t.replace(/[.,;:)]+$/, ''))
      .filter(t => /\.[A-Za-z0-9]{1,5}$/.test(t))
  )];

  // A documented path is dead only if nothing matches it. Check the working tree
  // first (a new file may not be committed yet), then tracked paths by suffix —
  // the map often writes "windows/polyglot-hooks.md" rather than the full path.
  const tracked = git(['ls-files']).split('\n').filter(Boolean).map(normPath);
  const dead = documented.filter(p => {
    if (fs.existsSync(path.join(projectDir, p))) return false;
    const n = normPath(p);
    return !tracked.some(f => f === n || f.endsWith('/' + n));
  });
  line('documented paths', documented.length);
  line('paths that no longer exist', dead.length);
  if (dead.length) {
    warn.push(`project-map.md documents ${dead.length} path(s) that are gone: ${dead.slice(0, 5).join(', ')}`);
  }

  const mapHash = (mapRaw.match(/Git:\s*([a-f0-9]+)/) || [])[1];
  const head = git(['rev-parse', '--short', 'HEAD']);
  if (mapHash && head) {
    if (mapHash === head) {
      line('freshness', `current (Git: ${mapHash})`);
    } else {
      const changed = new Set(git(['diff', '--name-only', `${mapHash}..HEAD`]).split('\n').filter(Boolean));
      const staleDocs = documented.filter(p =>
        changed.has(p) || (p.endsWith('/') && [...changed].some(c => c.startsWith(p)))
      );
      line('freshness', `${mapHash} → ${head}, ${staleDocs.length} documented file(s) changed`);
      if (staleDocs.length) {
        warn.push(`project-map.md is stale in ${staleDocs.length} place(s): ${staleDocs.slice(0, 5).join(', ')}`);
      }
    }
  }
}

// ── 4. known-issues.md ───────────────────────────────────────────────────────
out.push('\nknown-issues.md');
const kiRaw = read(path.join(projectDir, 'known-issues.md'));
if (!kiRaw) {
  line('status', 'absent — no error→solution memory');
} else {
  const heads = kiRaw.split('\n').filter(l => l.startsWith('## '));
  const fixed = heads.filter(l => l.startsWith('## ~~'));
  line('entries', `${heads.length} total (${heads.length - fixed.length} open, ${fixed.length} fixed)`);
  line('injected per session', `up to 5 open entries`);
  if (heads.length - fixed.length > 50) {
    warn.push('More than 50 open known-issues entries — prune stale ones.');
  }
}

// ── 5. state.md ──────────────────────────────────────────────────────────────
out.push('\nstate.md');
const statePath = path.join(projectDir, 'state.md');
const stateRaw = read(statePath);
if (!stateRaw) {
  line('status', 'absent — no cross-session task continuity');
} else {
  const ageDays = Math.floor((Date.now() - fs.statSync(statePath).mtimeMs) / 86400000);
  const stateLines = stateRaw.split('\n').length;
  const cleared = /Current Goal:.*no active task/i.test(stateRaw);
  line('age', `${ageDays} day(s)`);
  line('size', `${stateLines} lines (cap 100), ~${tokens(stateRaw)} tokens/session`);
  line('marked complete', cleared ? 'yes' : 'no');
  if (stateLines > 100) warn.push('state.md is over its 100-line cap — it is not compressed enough.');
  if (ageDays >= 7 && !cleared) {
    warn.push(`state.md is ${ageDays} days old and still claims an active task — ` +
      'confirm it is real or mark it "no active task".');
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log('Memory stack health —', projectDir);
console.log(out.join('\n'));

console.log('\nfindings');
if (warn.length === 0) {
  console.log('  none — the memory artifacts are consistent and within budget.');
} else {
  warn.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
}
console.log('');
