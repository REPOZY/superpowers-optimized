#!/usr/bin/env node
/**
 * Behavioral tests — Claude Code SessionStart hooks
 *   hooks/session-start     (bash) — the router
 *   hooks/session-memory.js (node) — project memory
 *
 * Runs the real hooks in throwaway git repos and inspects what they inject.
 *
 * The size tests matter most. Claude Code caps each hook's additionalContext at
 * 10,000 characters; anything longer reaches the model as a file path and a
 * 2,000-character preview it is never told to read. Router + memory in one hook
 * crossed that cap in every real session, so the model saw neither.
 *
 * Run: node tests/codex/test-session-start.js
 * Requires: bash, git, node on PATH.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROUTER_HOOK = path.join(REPO_ROOT, 'hooks', 'session-start');
const MEMORY_HOOK = path.join(REPO_ROOT, 'hooks', 'session-memory.js');
const CC_CAP = 10000;          // Claude Code's per-field limit
const ROUTER_LIMIT = 9800;     // what session-start budgets for

let passed = 0;
let failed = 0;

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

function makeDir({ git = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ss-bash-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ss-home-'));
  if (git) spawnSync('git', ['init', '--quiet'], { cwd: dir });
  return { dir, home };
}

function commitAt(dir, file, epochSeconds) {
  fs.writeFileSync(path.join(dir, file), String(Math.random()));
  const date = `${epochSeconds} +0000`;
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
    GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
  };
  spawnSync('git', ['add', file], { cwd: dir, env });
  spawnSync('git', ['commit', '--quiet', '-m', file], { cwd: dir, env });
}

function writeStateAt(dir, body, epochSeconds) {
  const p = path.join(dir, 'state.md');
  fs.writeFileSync(p, body);
  fs.utimesSync(p, epochSeconds, epochSeconds);
}

function hookEnv(home, extra = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, SUPERPOWERS_AUTO_UPDATE: '0' };
  delete env.CURSOR_PLUGIN_ROOT;
  env.CLAUDE_PLUGIN_ROOT = REPO_ROOT;
  return { ...env, ...extra };
}

function runRouter(dir, home) {
  const res = spawnSync('bash', [ROUTER_HOOK], {
    cwd: dir, input: '', encoding: 'utf8', env: hookEnv(home), timeout: 60000,
  });
  if (res.status !== 0) throw new Error(`router exited ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
}

function runMemoryRaw(dir, home, payload = {}, extraEnv = {}) {
  const res = spawnSync(process.execPath, [MEMORY_HOOK], {
    cwd: dir, input: JSON.stringify({ cwd: dir, ...payload }), encoding: 'utf8',
    env: hookEnv(home, extraEnv), timeout: 60000,
  });
  if (res.status !== 0) throw new Error(`memory hook exited ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

function runMemory(dir, home, payload) {
  const out = runMemoryRaw(dir, home, payload);
  return out.hookSpecificOutput ? out.hookSpecificOutput.additionalContext : '';
}

function cleanup(...dirs) {
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

const NOW = Math.floor(Date.now() / 1000);

// ── Router: size and contents ────────────────────────────────────────────────

console.log('\nRouter (hooks/session-start)');

for (const [label, opts] of [
  ['with project-map.md', { map: true, git: true }],
  ['without project-map.md', { map: false, git: true }],
  ['without git or map (adds the git notice)', { map: false, git: false }],
]) {
  test(`fits under Claude Code's 10,000-character cap — ${label}`, () => {
    const { dir, home } = makeDir({ git: opts.git });
    try {
      if (opts.map) fs.writeFileSync(path.join(dir, 'project-map.md'), '# Project Map\n');
      const ctx = runRouter(dir, home);
      assert.ok(ctx.length <= ROUTER_LIMIT,
        `router is ${ctx.length} chars (limit ${ROUTER_LIMIT}, hard cap ${CC_CAP}) — the model would get a 2K preview`);
      assert.ok(ctx.includes('## Routing Guide') && ctx.includes('## Red Flags'), 'router body incomplete');
    } finally { cleanup(dir, home); }
  });
}

test('carries no project memory — that is session-memory.js\'s field', () => {
  const { dir, home } = makeDir();
  try {
    // The router's prose names the tags (<state>, <project-map>…), so check for
    // the file contents instead.
    commitAt(dir, 'a.txt', NOW - 7200);
    fs.writeFileSync(path.join(dir, 'project-map.md'), '# Project Map\n\n## Critical Constraints\n- MAP_MARKER\n');
    writeStateAt(dir, 'Current Goal: STATE_MARKER', NOW);
    fs.writeFileSync(path.join(dir, 'known-issues.md'), '## ISSUE_MARKER\nfix\n');
    fs.writeFileSync(path.join(dir, 'session-log.md'), '## 2026-01-01 [saved]\nGoal: LOG_MARKER\n');
    writeSnapshot(dir, { changed_files: ['SNAPSHOT_MARKER.js'] });
    const ctx = runRouter(dir, home);
    for (const m of ['MAP_MARKER', 'STATE_MARKER', 'ISSUE_MARKER', 'LOG_MARKER', 'SNAPSHOT_MARKER']) {
      assert.ok(!ctx.includes(m), `${m} injected by the router hook`);
    }
  } finally { cleanup(dir, home); }
});

const GATE = 'Fresh project gate';
const STALENESS = 'Without git:';

test('project with a map: fresh-project gate stripped, staleness procedure kept', () => {
  const { dir, home } = makeDir();
  try {
    fs.writeFileSync(path.join(dir, 'project-map.md'), '# Project Map\n');
    const ctx = runRouter(dir, home);
    assert.ok(!ctx.includes(GATE), 'gate text injected although project-map.md exists');
    assert.ok(ctx.includes(STALENESS), 'map staleness procedure missing although a map exists');
    assert.ok(!ctx.includes('sp:if-'), 'section markers leaked into context');
  } finally { cleanup(dir, home); }
});

test('project without a map: gate kept, staleness procedure stripped', () => {
  const { dir, home } = makeDir();
  try {
    const ctx = runRouter(dir, home);
    assert.ok(ctx.includes(GATE), 'gate text missing in a project without project-map.md');
    assert.ok(!ctx.includes(STALENESS), 'staleness procedure injected although no map exists');
    assert.ok(!ctx.includes('sp:if-'), 'section markers leaked into context');
  } finally { cleanup(dir, home); }
});

test('SKILL.md itself keeps both sections (OpenCode and the Skill tool inject it unfiltered)', () => {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'using-superpowers', 'SKILL.md'), 'utf8');
  assert.ok(raw.includes(GATE) && raw.includes(STALENESS), 'a conditional section was deleted from the source');
});

// ── Memory: state.md resume framing ──────────────────────────────────────────

console.log('\nMemory (hooks/session-memory.js) — state.md framing');

test('a commit newer than state.md marks it possibly stale, even when state.md is hours old', () => {
  // The real failure: state.md said "commit pending", the user committed a minute
  // later, and the next session was told to resume the finished task.
  const { dir, home } = makeDir();
  try {
    writeStateAt(dir, 'Current Goal: ship v1\n- [ ] Commit', NOW - 3600);
    commitAt(dir, 'a.txt', NOW - 1800);
    const ctx = runMemory(dir, home);
    assert.ok(ctx.includes('<state>'), 'state.md not injected');
    assert.ok(!ctx.includes('ACTIVE TASK STATE'), 'finished task was injected as ACTIVE TASK STATE');
    assert.ok(ctx.includes('may be stale'), 'missing the stale framing');
  } finally { cleanup(dir, home); }
});

test('state.md written after the last commit is injected as active', () => {
  const { dir, home } = makeDir();
  try {
    commitAt(dir, 'a.txt', NOW - 7200);
    writeStateAt(dir, 'Current Goal: task 3 of 5', NOW - 60);
    assert.ok(runMemory(dir, home).includes('ACTIVE TASK STATE'), 'fresh state.md lost its active framing');
  } finally { cleanup(dir, home); }
});

test('"no active task" keeps its soft framing', () => {
  const { dir, home } = makeDir();
  try {
    commitAt(dir, 'a.txt', NOW - 7200);
    writeStateAt(dir, 'Current Goal: No active task', NOW - 60);
    const ctx = runMemory(dir, home);
    assert.ok(ctx.includes('indicates no active task'), 'cleared state lost its soft framing');
    assert.ok(!ctx.includes('ACTIVE TASK STATE'), 'cleared state injected as active');
  } finally { cleanup(dir, home); }
});

// ── Memory: context-snapshot label ───────────────────────────────────────────

console.log('\nMemory — context-snapshot label');

function writeSnapshot(dir, extra) {
  fs.writeFileSync(path.join(dir, 'context-snapshot.json'), JSON.stringify({
    git_hash: 'abc',
    changed_files: ['src/a.js', 'src/b.js'],
    recent_commits: ['abc one', 'def two'],
    blast_radius: {},
    cross_session_files: [],
    cross_session_commit_count: 0,
    ...extra,
  }));
}

test('never claims files are "changed since last commit" — changed_files are committed changes', () => {
  const { dir, home } = makeDir();
  try {
    writeSnapshot(dir, { changed_files_since: 'last-commit' });
    const ctx = runMemory(dir, home);
    assert.ok(!ctx.includes('Changed since last commit'), 'false label still injected');
    assert.ok(ctx.includes('Changed in the last commit: src/a.js, src/b.js'), 'missing accurate last-commit label');
  } finally { cleanup(dir, home); }
});

test('watermark-based snapshot is labelled as commits since the last session, listed once', () => {
  const { dir, home } = makeDir();
  try {
    writeSnapshot(dir, {
      changed_files_since: 'last-session',
      cross_session_files: ['src/a.js', 'src/b.js'],
      cross_session_commit_count: 3,
    });
    const ctx = runMemory(dir, home);
    assert.ok(ctx.includes('Committed since your last session (3 commits): src/a.js, src/b.js'),
      'missing accurate since-last-session label');
    assert.strictEqual(ctx.split('src/a.js, src/b.js').length - 1, 1, 'file list injected twice');
  } finally { cleanup(dir, home); }
});

test('snapshot from an older engine (no changed_files_since) gets a neutral label', () => {
  const { dir, home } = makeDir();
  try {
    writeSnapshot(dir, {});
    const ctx = runMemory(dir, home);
    assert.ok(!ctx.includes('Changed since last commit'), 'false label still injected');
    assert.ok(ctx.includes('Changed in recent commits: src/a.js, src/b.js'), 'missing neutral label');
  } finally { cleanup(dir, home); }
});

// ── Memory: budget ───────────────────────────────────────────────────────────

console.log('\nMemory — budget');

function bloat(dir) {
  const map = ['# Project Map', '_Generated: 2026-01-01 | Git: abc1234_', '', '## Directory Structure'];
  for (let i = 0; i < 120; i++) map.push(`dir${i}/ — ${'directory purpose text '.repeat(4)}`);
  map.push('', '## Key Files');
  for (let i = 0; i < 120; i++) map.push(`src/file${i}.js — ${'what it does and why it matters '.repeat(3)}`);
  map.push('', '## Critical Constraints', '- NEVER_DROP_THIS_CONSTRAINT: hooks.json uses escaped quotes', '', '## Hot Files', 'a, b, c');
  fs.writeFileSync(path.join(dir, 'project-map.md'), map.join('\n'));
  writeStateAt(dir, 'Current Goal: STATE_MARKER\n' + 'progress line\n'.repeat(200), NOW);
  fs.writeFileSync(path.join(dir, 'known-issues.md'),
    Array.from({ length: 9 }, (_, i) => `## Issue ${i}\n${'detail '.repeat(150)}\n`).join('\n'));
  fs.writeFileSync(path.join(dir, 'session-log.md'),
    Array.from({ length: 4 }, (_, i) => `## 2026-01-0${i + 1} [saved]\nGoal: entry ${i}\n${'decision '.repeat(150)}\n`).join('\n'));
  writeSnapshot(dir, { changed_files_since: 'last-commit' });
}

test('oversized memory still fits the cap, keeping state and Critical Constraints', () => {
  const { dir, home } = makeDir();
  try {
    bloat(dir);
    const ctx = runMemory(dir, home);
    assert.ok(ctx.length <= CC_CAP, `memory is ${ctx.length} chars — over the ${CC_CAP} cap`);
    assert.ok(ctx.includes('STATE_MARKER'), 'state.md dropped although it has top priority');
    assert.ok(ctx.includes('NEVER_DROP_THIS_CONSTRAINT'), 'Critical Constraints dropped before lower-priority sections');
    assert.ok(/project-map\.md shortened .*omitted: .*Directory Structure/.test(ctx),
      'map shortened without saying what was omitted');
  } finally { cleanup(dir, home); }
});

test('a block cut entirely by the budget is named, not silently dropped', () => {
  const { dir, home } = makeDir();
  try {
    writeStateAt(dir, 'Current Goal: x\n' + 'progress line\n'.repeat(500), NOW);   // clipped to 3,000
    fs.writeFileSync(path.join(dir, 'session-log.md'),
      `## 2026-01-01 [saved]\n${'d '.repeat(400)}\n\n## 2026-01-02 [saved]\n${'d '.repeat(400)}\n`);
    writeSnapshot(dir, {
      changed_files_since: 'last-commit',
      changed_files: Array.from({ length: 60 }, (_, i) => `src/module${i}/file.js`),
    });
    const { buildMemory } = require(MEMORY_HOOK);
    const { text } = buildMemory(dir, 3800);
    assert.ok(!text.includes('<session-log>'), 'precondition: the budget should have cut the log');
    assert.ok(/Not shown for size.*session-log\.md \(2 latest saved entries\)/.test(text), 'log dropped without a note');
    assert.ok(/Not shown for size.*context-snapshot\.json/.test(text), 'snapshot dropped without a note');
    assert.ok(text.length <= 3800, `note pushed output past the budget (${text.length})`);
  } finally { cleanup(dir, home); }
});

test('the real project memory of this repo fits the cap', () => {
  const { home } = makeDir({ git: false });
  try {
    const ctx = runMemory(REPO_ROOT, home);
    assert.ok(ctx.length <= CC_CAP, `this repo's memory is ${ctx.length} chars — over the cap`);
  } finally { cleanup(home); }
});

test('records exactly the injected entries in the recall ledger', () => {
  const { dir, home } = makeDir();
  try {
    bloat(dir);
    const ctx = runMemory(dir, home, { session_id: 'sess-ledger-1' });
    const ledgerPath = path.join(home, '.claude', 'hooks-logs', 'recall-sess-ledger-1.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    for (const h of ledger.sessionLog) assert.ok(ctx.includes(h), `ledger claims "${h}" was injected but it was not`);
    for (const h of ledger.knownIssues) assert.ok(ctx.includes(h), `ledger claims "${h}" was injected but it was not`);
    assert.ok(ledger.knownIssues.length > 0, 'nothing recorded although issues were injected');
  } finally { cleanup(dir, home); }
});

test('after /compact the ledger restarts, so earlier recalls can surface again', () => {
  const { dir, home } = makeDir();
  try {
    fs.writeFileSync(path.join(dir, 'known-issues.md'), '## Injected now\nfix\n');
    const ledgerPath = path.join(home, '.claude', 'hooks-logs', 'recall-sess-compact.json');
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify({ sessionLog: ['## recalled before compaction [saved]'], knownIssues: [] }));

    runMemory(dir, home, { session_id: 'sess-compact', source: 'startup' });
    let ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    assert.ok(ledger.sessionLog.includes('## recalled before compaction [saved]'), 'non-compact run dropped earlier entries');

    runMemory(dir, home, { session_id: 'sess-compact', source: 'compact' });
    ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    assert.deepStrictEqual(ledger.sessionLog, [], 'pre-compaction recall still marked as seen');
    assert.deepStrictEqual(ledger.knownIssues, ['## Injected now']);
  } finally { cleanup(dir, home); }
});

test('no memory files → emits {}', () => {
  const { dir, home } = makeDir();
  try {
    assert.deepStrictEqual(runMemoryRaw(dir, home), {});
  } finally { cleanup(dir, home); }
});

test('Cursor gets additional_context, not the Claude envelope', () => {
  const { dir, home } = makeDir();
  try {
    fs.writeFileSync(path.join(dir, 'known-issues.md'), '## Err\nfix\n');
    const out = runMemoryRaw(dir, home, {}, { CURSOR_PLUGIN_ROOT: REPO_ROOT });
    assert.ok(typeof out.additional_context === 'string' && out.additional_context.includes('Err'), JSON.stringify(out));
    assert.ok(!out.hookSpecificOutput, 'Claude envelope emitted for Cursor');
  } finally { cleanup(dir, home); }
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`session-start + session-memory: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
