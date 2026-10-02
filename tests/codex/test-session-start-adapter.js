#!/usr/bin/env node
/**
 * Unit tests — hooks/codex/session-start-adapter.js
 *
 * Verifies output shape, context assembly, and graceful fallbacks.
 * Does NOT test the live git fetch / auto-update path (network-dependent).
 *
 * Run: node tests/codex/test-session-start-adapter.js
 * No dependencies beyond Node.js stdlib.
 */

'use strict';

const { buildSessionContext } = require('../../hooks/codex/session-start-adapter');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function runAdapter(payload, cwd) {
  const previous = process.env.SUPERPOWERS_AUTO_UPDATE;
  process.env.SUPERPOWERS_AUTO_UPDATE = '0';

  const raw = buildSessionContext(cwd);
  let parsed = {};
  try {
    parsed = JSON.parse(raw.trim() || '{}');
  } catch {}
  parsed._rawPlainText = raw;
  if (previous === undefined) delete process.env.SUPERPOWERS_AUTO_UPDATE;
  else process.env.SUPERPOWERS_AUTO_UPDATE = previous;
  return parsed;
}

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ss-test-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ── Output shape ──────────────────────────────────────────────────────────────

console.log('\nOutput shape (Codex SessionStart spec)');

test('Output is plain-text context on stdout', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ session_id: 'test-123', source: 'startup' }, dir);
    assert.ok(typeof result._rawPlainText === 'string' && result._rawPlainText.length > 0,
      `Missing plain-text context: ${JSON.stringify(result)}`);
  } finally { cleanup(dir); }
});

test('Output does not require a JSON hook envelope', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ source: 'startup' }, dir);
    assert.ok(!result.hookSpecificOutput,
      `Unexpected hookSpecificOutput envelope: ${JSON.stringify(result)}`);
  } finally { cleanup(dir); }
});

test('No top-level additionalContext (Claude Code shape must not appear)', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ source: 'startup' }, dir);
    assert.ok(!result.additionalContext,
      'Top-level additionalContext found — this is the Claude Code shape, not Codex');
    assert.ok(!result.additional_context,
      'Top-level additional_context found — wrong output shape');
  } finally { cleanup(dir); }
});

// ── Context content ───────────────────────────────────────────────────────────

console.log('\nContext content');

test('Context contains EXTREMELY_IMPORTANT wrapper (plain text)', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ source: 'startup' }, dir);
    const plainText = result._rawPlainText || '';
    assert.ok(
      plainText.includes('EXTREMELY_IMPORTANT'),
      'Missing EXTREMELY_IMPORTANT block in context'
    );
  } finally { cleanup(dir); }
});

test('Context contains using-superpowers entry point instruction (plain text)', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ source: 'startup' }, dir);
    const plainText = result._rawPlainText || '';
    assert.ok(
      plainText.includes('using-superpowers') || plainText.includes('superpowers-optimized'),
      'Missing using-superpowers reference in context'
    );
  } finally { cleanup(dir); }
});

test('project-map.md injected when present', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'project-map.md'), '# Project Map\n\nThis is the map.');
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(ctx.includes('<project-map>'),
      'project-map.md present but not injected');
    assert.ok(ctx.includes('This is the map.'),
      'project-map.md content not in context');
  } finally { cleanup(dir); }
});

test('project-map.md NOT injected when absent', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(!ctx.includes('<project-map>'),
      'project-map tag present despite no project-map.md file');
  } finally { cleanup(dir); }
});

test('state.md injected when present', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'state.md'), '## In Progress\nWorking on feature X');
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(ctx.includes('<state>'),
      'state.md present but not injected');
    assert.ok(ctx.includes('Working on feature X'),
      'state.md content not in context');
  } finally { cleanup(dir); }
});

test('known-issues.md injected when present', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'known-issues.md'), '## Error XYZ\nRun npm ci first');
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(ctx.includes('<known-issues>'),
      'known-issues.md present but not injected');
  } finally { cleanup(dir); }
});

test('session-log.md: only [saved] entries injected, not [auto]', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'session-log.md'), [
      '## 2026-01-01 10:00 [auto]',
      'Files: index.js',
      '',
      '## 2026-01-02 12:00 [saved]',
      'Goal: add feature Y',
      'Decision: used approach Z',
      '',
    ].join('\n'));
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(ctx.includes('<session-log>'),
      'session-log.md present but not injected');
    assert.ok(ctx.includes('add feature Y'),
      '[saved] entry content not in context');
    assert.ok(!ctx.includes('Files: index.js'),
      '[auto] entry content incorrectly included');
  } finally { cleanup(dir); }
});

test('session-log.md: [superseded] entries are never injected (D4)', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'session-log.md'), [
      '## 2026-01-01 10:00 [saved]',
      'Goal: live decision A',
      '',
      '## 2026-01-02 12:00 [saved]',
      'Goal: live decision B',
      '',
      '## 2026-01-03 12:00 [saved] [superseded by 2026-02-01]',
      'Goal: overturned decision that must never be resurfaced',
      '',
    ].join('\n'));
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(!ctx.includes('overturned decision'),
      'a superseded decision was injected as if it were still current');
    assert.ok(ctx.includes('live decision B'),
      'the newest live entry should still be injected');
    assert.ok(ctx.includes('live decision A'),
      'the second-newest live entry should be injected once superseded ones are skipped');
  } finally { cleanup(dir); }
});

test('Large project-map.md (>200 lines) → truncated to key sections', () => {
  const dir = makeTempDir();
  try {
    // Must exceed 200 lines to trigger truncation path.
    // 1+1 (title/blank) + 1+1+160 (overview) + 1+1+1+50 (constraints) + 1+1+1 (hot files) = 220
    const lines = ['# Project Map', ''];
    lines.push('## Overview', 'Some overview text that should be cut.');
    for (let i = 0; i < 160; i++) lines.push(`Overview line ${i}`);
    lines.push('', '## Critical Constraints', 'Never delete production database.');
    for (let i = 0; i < 50; i++) lines.push(`Constraint ${i}`);
    lines.push('', '## Hot Files', 'src/core.js is the entry point.');
    fs.writeFileSync(path.join(dir, 'project-map.md'), lines.join('\n'));
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(ctx.includes('Critical Constraints'),
      'Critical Constraints section missing from large map');
    assert.ok(ctx.includes('Hot Files'),
      'Hot Files section missing from large map');
    // Overview section (not a key section) should be trimmed
    assert.ok(!ctx.includes('Some overview text that should be cut.'),
      'Overview section incorrectly included in large map injection');
  } finally { cleanup(dir); }
});

// ── Parity with hooks/session-start ───────────────────────────────────────────

console.log('\nParity with hooks/session-start');

const { spawnSync } = require('child_process');
const NOW = Math.floor(Date.now() / 1000);

function gitRepo() {
  const dir = makeTempDir();
  spawnSync('git', ['init', '--quiet'], { cwd: dir });
  return dir;
}

function commitAt(dir, epochSeconds) {
  fs.writeFileSync(path.join(dir, 'a.txt'), String(Math.random()));
  const date = `${epochSeconds} +0000`;
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
    GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
  };
  spawnSync('git', ['add', 'a.txt'], { cwd: dir, env });
  spawnSync('git', ['commit', '--quiet', '-m', 'c'], { cwd: dir, env });
}

function writeStateAt(dir, body, epochSeconds) {
  const p = path.join(dir, 'state.md');
  fs.writeFileSync(p, body);
  fs.utimesSync(p, epochSeconds, epochSeconds);
}

test('state.md older than the last commit is framed as possibly stale, not ACTIVE', () => {
  const dir = gitRepo();
  try {
    writeStateAt(dir, 'Current Goal: ship v1', NOW - 3600);
    commitAt(dir, NOW - 1800);
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(!ctx.includes('ACTIVE TASK STATE'), 'finished task injected as ACTIVE TASK STATE');
    assert.ok(ctx.includes('may be stale'), 'missing stale framing');
  } finally { cleanup(dir); }
});

test('state.md newer than the last commit is framed as active', () => {
  const dir = gitRepo();
  try {
    commitAt(dir, NOW - 7200);
    writeStateAt(dir, 'Current Goal: task 3 of 5', NOW - 60);
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(ctx.includes('ACTIVE TASK STATE'), 'fresh state.md lost its active framing');
  } finally { cleanup(dir); }
});

test('"no active task" state.md gets soft framing', () => {
  const dir = gitRepo();
  try {
    commitAt(dir, NOW - 7200);
    writeStateAt(dir, 'Current Goal: No active task', NOW - 60);
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(ctx.includes('indicates no active task'), 'cleared state lost its soft framing');
    assert.ok(!ctx.includes('ACTIVE TASK STATE'), 'cleared state injected as active');
  } finally { cleanup(dir); }
});

test('known-issues: fixed (struck) entries are not injected', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'known-issues.md'),
      '## ~~Old fixed error~~\nResolved long ago\n\n## Live error\nRun npm ci first\n');
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(ctx.includes('Live error'), 'open issue missing');
    assert.ok(!ctx.includes('Resolved long ago'), 'fixed issue injected');
  } finally { cleanup(dir); }
});

test('known-issues: capped at the 5 most recent open entries', () => {
  const dir = makeTempDir();
  try {
    const body = Array.from({ length: 7 }, (_, i) => `## Issue ${i}\nbody ${i}\n`).join('\n');
    fs.writeFileSync(path.join(dir, 'known-issues.md'), body);
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(!ctx.includes('body 0') && !ctx.includes('body 1'), 'oldest entries beyond the cap injected');
    assert.ok(ctx.includes('body 6') && ctx.includes('body 2'), 'newest 5 entries missing');
    assert.ok(ctx.includes('2 more open issues'), 'missing overflow note');
  } finally { cleanup(dir); }
});

test('context-snapshot: never labelled "changed since last commit"', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'context-snapshot.json'), JSON.stringify({
      changed_files: ['src/a.js'], recent_commits: ['abc one'], changed_files_since: 'last-commit',
    }));
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(!ctx.includes('Changed since last commit'), 'false label still injected');
    assert.ok(ctx.includes('Changed in the last commit: src/a.js'), 'missing accurate label');
  } finally { cleanup(dir); }
});

test('context-snapshot: watermark-based snapshot labelled as since last session', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'context-snapshot.json'), JSON.stringify({
      changed_files: ['src/a.js'], recent_commits: ['abc one'],
      changed_files_since: 'last-session', cross_session_commit_count: 1,
    }));
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(ctx.includes('Committed since your last session (1 commit): src/a.js'), 'missing since-last-session label');
  } finally { cleanup(dir); }
});

test('Router: map present → fresh-project gate stripped, staleness procedure kept', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'project-map.md'), '# Project Map\n');
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(!ctx.includes('Fresh project gate'), 'gate text injected although project-map.md exists');
    assert.ok(ctx.includes('Without git:'), 'staleness procedure missing although a map exists');
    assert.ok(!ctx.includes('sp:if-'), 'section markers leaked into context');
  } finally { cleanup(dir); }
});

test('Router: no map → gate kept, staleness procedure stripped', () => {
  const dir = makeTempDir();
  try {
    const ctx = runAdapter({}, dir)._rawPlainText;
    assert.ok(ctx.includes('Fresh project gate'), 'gate text missing without project-map.md');
    assert.ok(!ctx.includes('Without git:'), 'staleness procedure injected although no map exists');
    assert.ok(!ctx.includes('sp:if-'), 'section markers leaked into context');
  } finally { cleanup(dir); }
});

// ── Resilience ────────────────────────────────────────────────────────────────

console.log('\nResilience');

test('Empty cwd payload → does not crash, returns text output', () => {
  const result = runAdapter({}, process.cwd());
  assert.ok(typeof result._rawPlainText === 'string', 'Did not return text output');
});

test('Missing stdin cwd → falls back to process.cwd(), does not crash', () => {
  const previous = process.env.SUPERPOWERS_AUTO_UPDATE;
  process.env.SUPERPOWERS_AUTO_UPDATE = '0';
  const raw = buildSessionContext(process.cwd());
  if (previous === undefined) delete process.env.SUPERPOWERS_AUTO_UPDATE;
  else process.env.SUPERPOWERS_AUTO_UPDATE = previous;
  assert.ok(raw.length > 0, 'No SessionStart context when cwd omitted from payload');
});

test('context-snapshot.json with bad JSON → silently skipped', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'context-snapshot.json'), 'NOT VALID JSON {{{');
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result._rawPlainText || '';
    assert.ok(ctx.length > 0, 'Adapter crashed on bad context-snapshot.json');
    assert.ok(!ctx.includes('NOT VALID JSON'),
      'Bad JSON content leaked into context');
  } finally { cleanup(dir); }
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`session-start-adapter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
