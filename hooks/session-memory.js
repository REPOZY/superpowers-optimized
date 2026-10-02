#!/usr/bin/env node
/**
 * SessionStart Hook — Project Memory
 *
 * Injects the project's memory files: project-map.md (+ staleness), the last
 * [saved] session-log entries, state.md, open known-issues, and the
 * context-snapshot summary.
 *
 * This runs as its own hook, separate from session-start (the router), because
 * Claude Code caps each hook's additionalContext at 10,000 characters. Over the
 * cap, the whole string is replaced by a file path and a 2,000-character preview
 * that the model is never told to read. When router and memory shared one hook,
 * every session crossed the cap and the model saw only the first 2,000 characters
 * of the router and none of the memory. Each hook's output is measured on its own,
 * so the split gives each a full budget — and this hook fills its budget in
 * priority order instead of overflowing it.
 *
 * Shared with hooks/codex/session-start-adapter.js so the two injectors cannot
 * drift apart again.
 *
 * Input:  stdin JSON { cwd, session_id, ... }
 * Output: Claude:  { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }
 *         Cursor / other: { additional_context }
 *         {} when the project has no memory files.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Under the 10,000-character cap with room for the tag wrappers.
const MEMORY_BUDGET = 9500;
const NOTE_RESERVE = 300;          // kept free for the omission notes, which are added after admission
const STATE_MAX = 3000;
const ENTRY_MAX = 1500;           // session-log entry cap, matches context-management
const MAX_KNOWN_ISSUES = 5;
const MAX_SAVED_ENTRIES = 2;
const MAP_FULL_MAX_LINES = 200;   // above this, only Critical Constraints + Hot Files
const PRIORITY_MAP_SECTIONS = ['Critical Constraints'];

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function git(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function clip(text, max, note) {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - note.length - 1));
  const atLine = cut.lastIndexOf('\n');
  return (atLine > max / 2 ? cut.slice(0, atLine) : cut).trimEnd() + '\n' + note;
}

// ── project-map.md ───────────────────────────────────────────────────────────

/** Split markdown into a preamble and its "## " sections, preserving order. */
function splitSections(md) {
  const sections = [];
  let preamble = '';
  let cur = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      if (cur) sections.push(cur);
      cur = { name: line.slice(3).trim(), text: line };
    } else if (cur) {
      cur.text += '\n' + line;
    } else {
      preamble += (preamble ? '\n' : '') + line;
    }
  }
  if (cur) sections.push(cur);
  return { preamble: preamble.trim(), sections: sections.map(s => ({ ...s, text: s.text.trim() })) };
}

/**
 * Which documented files changed since the map's recorded commit.
 * Returns null (not stale / not applicable) or the <project-map-stale> text.
 */
function mapStaleness(cwd, raw) {
  const m = raw.match(/Git: ([a-f0-9]+)/);
  if (!m) return null;
  const mapHash = m[1];
  const head = git('git rev-parse --short HEAD', cwd);
  if (!head || head === mapHash) return null;

  const changedRaw = git(`git diff --name-only ${mapHash}..HEAD`, cwd);
  const changed = new Set((changedRaw || '').split('\n').filter(Boolean));
  if (changed.size === 0) {
    return `<project-map-stale>project-map.md records Git: ${mapHash} but current HEAD is ${head}, and the diff between them could not be computed (the recorded commit may no longer exist). Verify any structural claim from the map against the filesystem before relying on it.</project-map-stale>`;
  }

  // Paths the map documents: any token containing a slash.
  const documented = new Set();
  for (const t of raw.matchAll(/[A-Za-z0-9_@.\-]+(?:\/[A-Za-z0-9_@.\-]+)+/g)) {
    documented.add(t[0].replace(/[.,;:)]+$/, ''));
  }
  const hits = [...changed].filter(f => {
    if (documented.has(f)) return true;
    for (const d of documented) if (d.endsWith('/') && f.startsWith(d)) return true;
    return false;
  });
  if (hits.length === 0) {
    return `<project-map-stale>project-map.md records Git: ${mapHash} and HEAD is now ${head}, but none of the files it documents changed. Its Key Files and Critical Constraints are still accurate — treat the map as usable and just refresh the header hash next time you touch it.</project-map-stale>`;
  }
  const MAX = 10;
  let list = hits.slice(0, MAX).join(', ');
  if (hits.length > MAX) list += ` (+${hits.length - MAX} more)`;
  return `<project-map-stale>project-map.md is stale in ${hits.length} place(s). These documented files changed since the map was written (Git: ${mapHash} → ${head}):\n${list}\n\nRe-read ONLY those files and update their Key Files entries plus the header hash. Everything else in the map is still accurate — do not regenerate it.</project-map-stale>`;
}

// ── session-log.md ───────────────────────────────────────────────────────────

/** Live [saved] entries, oldest first. [superseded ...] entries are never injected. */
function liveSavedEntries(cwd) {
  const raw = read(path.join(cwd, 'session-log.md'));
  if (!raw) return [];
  const entries = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('## ')) {
      if (cur !== null) entries.push(cur.trim());
      cur = /\[saved\]/.test(line) && !/\[superseded/.test(line) ? line : null;
    } else if (cur !== null) {
      cur += '\n' + line;
    }
  }
  if (cur !== null) entries.push(cur.trim());
  return entries;
}

// ── state.md ─────────────────────────────────────────────────────────────────

/**
 * cleared — "Current Goal" says "no active task" → soft notice
 * stale   — a commit landed after state.md was written → warn
 * active  — otherwise → "ACTIVE TASK STATE"
 *
 * A newer commit alone is the drift signal. Age is not: an untouched state.md on
 * a paused project is still accurate, while one written a minute before the
 * commit that finished the task is already wrong. A wrong "stale" costs one
 * confirmation; a wrong "resume from here" pulls the session onto finished work.
 */
function stateBlock(cwd) {
  const statePath = path.join(cwd, 'state.md');
  const raw = read(statePath).trim();
  if (!raw) return '';
  const body = clip(raw, STATE_MAX, '*(state.md truncated — read the file for the rest)*');

  const goalLine = raw.split('\n').find(l => /^Current Goal:/i.test(l)) || '';
  if (/no active task/i.test(goalLine)) {
    return `<state>\n*(state.md exists but indicates no active task — review before treating as a resume point)*\n${body}\n</state>`;
  }

  let stateMtime = 0;
  try { stateMtime = Math.floor(fs.statSync(statePath).mtimeMs / 1000); } catch {}
  const lastCommit = parseInt(git('git log --format=%ct -1', cwd) || '0', 10) || 0;
  if (lastCommit > stateMtime) {
    const ageDays = Math.floor((Date.now() / 1000 - stateMtime) / 86400);
    return `<state>\n**state.md may be stale** (written ${ageDays} day(s) ago; newer commits exist). Confirm the task is still active before resuming — do not treat this as a guaranteed resume point:\n${body}\n</state>`;
  }
  return `<state>\n**ACTIVE TASK STATE — resume from here, do not start fresh:**\n${body}\n</state>`;
}

// ── known-issues.md ──────────────────────────────────────────────────────────

/** Open entries, oldest first. Fixed entries (## ~~...~~) are skipped. */
function openKnownIssues(cwd) {
  const raw = read(path.join(cwd, 'known-issues.md'));
  if (!raw) return [];
  const entries = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('## ')) {
      if (cur !== null) entries.push(cur.trim());
      cur = line.startsWith('## ~~') ? null : line;
    } else if (cur !== null) {
      cur += '\n' + line;
    }
  }
  if (cur !== null) entries.push(cur.trim());
  return entries;
}

// ── context-snapshot.json ────────────────────────────────────────────────────

function snapshotBlock(cwd) {
  let s;
  try { s = JSON.parse(read(path.join(cwd, 'context-snapshot.json'))); } catch { return ''; }
  if (!s || typeof s !== 'object') return '';
  const files = (s.changed_files || []).join(', ');
  if (!files) return '';

  // changed_files are COMMITTED changes, diffed from the last session's HEAD or
  // from HEAD~1 — never uncommitted work. When the watermark was used,
  // cross_session_files is the same list, so it is printed once.
  const xs = s.cross_session_commit_count || 0;
  let label = 'Changed in recent commits';
  if (s.changed_files_since === 'last-session') label = `Committed since your last session (${xs} commit${xs === 1 ? '' : 's'})`;
  else if (s.changed_files_since === 'last-commit') label = 'Changed in the last commit';

  let out = `${label}: ${files}`;
  const commits = (s.recent_commits || []).slice(0, 3);
  if (commits.length) out += '\nRecent commits:\n  ' + commits.join('\n  ');

  const changedSet = new Set(s.changed_files || []);
  const br = Object.entries(s.blast_radius || {})
    .map(([f, deps]) => {
      const fresh = (deps || []).filter(d => !changedSet.has(d));
      return fresh.length ? `  ${f} → ${fresh.slice(0, 3).join(', ')}` : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  if (br.length) out += '\nBlast radius (dependents to review):\n' + br.join('\n');
  return `<context-snapshot>\n${out}\n</context-snapshot>`;
}

// ── Assembly under budget ────────────────────────────────────────────────────

/**
 * Build the memory context. Blocks are admitted in priority order until the
 * budget is spent, then emitted in reading order. What was cut is said in the
 * output, so the model knows to read the file rather than assume it saw it all.
 *
 * Priority: state → map staleness → map Critical Constraints → known issues →
 * session-log entries → the rest of the map → context snapshot.
 * Constraints outrank the rest of the map because the rest is a repository
 * overview, which measured as no help to agents locating files.
 *
 * Returns { text, injected: { sessionLog: [headers], knownIssues: [headers] } }.
 */
function buildMemory(cwd, budget = MEMORY_BUDGET) {
  let left = budget - NOTE_RESERVE;
  const admit = (text) => {
    if (!text || text.length + 2 > left) return false;
    left -= text.length + 2;
    return true;
  };

  const state = stateBlock(cwd);
  const stateOk = admit(state);

  const mapRaw = read(path.join(cwd, 'project-map.md'));
  const stale = mapRaw ? mapStaleness(cwd, mapRaw) : null;
  const staleOk = admit(stale);

  // Map sections: priority ones first, the rest later if budget remains.
  let mapParts = null;
  const omitted = [];
  if (mapRaw) {
    const { preamble, sections } = splitSections(mapRaw);
    const tooLong = mapRaw.split('\n').length > MAP_FULL_MAX_LINES;
    const eligible = tooLong
      ? sections.filter(s => /^(Critical Constraints|Hot Files)/.test(s.name))
      : sections;
    if (tooLong) {
      for (const s of sections) if (!eligible.includes(s)) omitted.push(s.name);
    }
    mapParts = { preamble, sections: eligible, kept: new Set() };
    admit(preamble);
    for (const s of eligible) {
      if (PRIORITY_MAP_SECTIONS.some(p => s.name.startsWith(p))) {
        if (admit(s.text)) mapParts.kept.add(s);
        else {
          const room = Math.max(0, left - 200);
          const clipped = clip(s.text, room, '*(section truncated — read project-map.md for the rest)*');
          if (room > 300 && admit(clipped)) { s.text = clipped; mapParts.kept.add(s); }
        }
      }
    }
  }

  const issues = openKnownIssues(cwd);
  const shownIssues = issues.slice(-MAX_KNOWN_ISSUES)
    .map(e => clip(e, ENTRY_MAX, '*(entry truncated)*'));
  const issueOverflow = issues.length > MAX_KNOWN_ISSUES
    ? `*(+ ${issues.length - MAX_KNOWN_ISSUES} more open issues — see known-issues.md)*` : '';
  const keptIssues = [];
  for (let i = shownIssues.length - 1; i >= 0; i--) {          // newest first
    if (admit(shownIssues[i])) keptIssues.unshift(i);
  }

  const saved = liveSavedEntries(cwd).slice(-MAX_SAVED_ENTRIES)
    .map(e => clip(e, ENTRY_MAX, '*(entry truncated)*'));
  const keptSaved = [];
  for (let i = saved.length - 1; i >= 0; i--) {                // newest first
    if (admit(saved[i])) keptSaved.unshift(i);
  }

  if (mapParts) {
    for (const s of mapParts.sections) {
      if (mapParts.kept.has(s)) continue;
      if (admit(s.text)) mapParts.kept.add(s);
      else omitted.push(s.name);
    }
  }

  const snapshot = snapshotBlock(cwd);
  const snapshotOk = admit(snapshot);

  // ── Emit in reading order ──
  const blocks = [];
  if (mapParts && (mapParts.kept.size > 0 || mapParts.preamble)) {
    let body = [mapParts.preamble, ...mapParts.sections.filter(s => mapParts.kept.has(s)).map(s => s.text)]
      .filter(Boolean).join('\n\n');
    if (omitted.length) {
      body += `\n\n*(project-map.md shortened to fit the session-start budget — omitted: ${omitted.join(', ')}. Read the file when you need them.)*`;
    }
    blocks.push(`<project-map>\n${body}\n</project-map>`);
  }
  if (staleOk) blocks.push(stale);
  if (keptSaved.length) {
    const more = keptSaved.length < saved.length ? '\n\n*(older entry omitted for size)*' : '';
    blocks.push(`<session-log>\n*(Last saved decisions from session-log.md — full history searchable at session-log.md)*\n${keptSaved.map(i => saved[i]).join('\n\n')}${more}\n</session-log>`);
  }
  if (stateOk) blocks.push(state);
  else if (state) blocks.push('<state>\n*(state.md exists but did not fit the session-start budget — read it before resuming any task)*\n</state>');
  if (keptIssues.length) {
    let body = keptIssues.map(i => shownIssues[i]).join('\n\n');
    const dropped = shownIssues.length - keptIssues.length;
    if (dropped > 0 || issueOverflow) {
      const extra = (issues.length - MAX_KNOWN_ISSUES > 0 ? issues.length - MAX_KNOWN_ISSUES : 0) + dropped;
      body += `\n\n*(+ ${extra} more open issues — see known-issues.md)*`;
    }
    blocks.push(`<known-issues>\n${body}\n</known-issues>`);
  }
  if (snapshotOk) blocks.push(snapshot);

  // Blocks that existed but lost the budget entirely — say so, or the model
  // assumes there was nothing to see.
  const unseen = [];
  if (saved.length && !keptSaved.length) unseen.push(`session-log.md (${saved.length} latest saved entr${saved.length === 1 ? 'y' : 'ies'})`);
  if (shownIssues.length && !keptIssues.length) unseen.push(`known-issues.md (${issues.length} open)`);
  if (snapshot && !snapshotOk) unseen.push('context-snapshot.json (recent commits)');
  if (unseen.length) blocks.push(`*(Not shown for size — read when relevant: ${unseen.join(', ')})*`);

  const header = (e) => e.split('\n')[0].trim();
  return {
    text: blocks.join('\n\n'),
    injected: {
      sessionLog: keptSaved.map(i => header(saved[i])),
      knownIssues: keptIssues.map(i => header(shownIssues[i])),
    },
  };
}

/**
 * Tell skill-activator's per-session recall ledger exactly which entries were
 * injected, so recall neither repeats them nor suppresses ones the budget cut.
 */
function recordInjected(cwd, sessionId, injected, source) {
  if (!sessionId) return;
  try {
    const sa = require('./skill-activator');
    // After /compact, entries recalled earlier survive only as a summary, so the
    // ledger restarts from what this run re-injected and recall may surface them
    // again. Any other re-run in the same session merges.
    const empty = { sessionLog: [], knownIssues: [] };
    const base = source === 'compact' ? empty : (sa.readRecallLedger(sessionId) || empty);
    sa.saveRecallLedger(sessionId, {
      sessionLog: [...new Set([...base.sessionLog, ...injected.sessionLog])],
      knownIssues: [...new Set([...base.knownIssues, ...injected.knownIssues])],
    });
  } catch {
    // Never block session start on ledger writes
  }
}

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch {}
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch {}
  const cwd = (data && typeof data.cwd === 'string' && data.cwd) || process.cwd();

  const { text, injected } = buildMemory(cwd);
  recordInjected(cwd, data && data.session_id, injected, data && data.source);

  if (!text) { process.stdout.write('{}'); return; }
  if (process.env.CURSOR_PLUGIN_ROOT || !process.env.CLAUDE_PLUGIN_ROOT) {
    process.stdout.write(JSON.stringify({ additional_context: text }));
  } else {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
    }));
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    buildMemory,
    mapStaleness,
    splitSections,
    stateBlock,
    snapshotBlock,
    openKnownIssues,
    liveSavedEntries,
    recordInjected,
    MEMORY_BUDGET,
  };
}
