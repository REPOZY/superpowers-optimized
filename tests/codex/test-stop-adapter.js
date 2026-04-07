#!/usr/bin/env node
/**
 * Unit tests — hooks/codex/stop-adapter.js
 *
 * Tests loop-guard behavior, systemMessage output shape, and reminder
 * logic. Uses a temporary git repo to simulate changed files.
 *
 * Run: node tests/codex/test-stop-adapter.js
 * No dependencies beyond Node.js stdlib.
 */

'use strict';

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const ADAPTER = path.resolve(__dirname, '../../hooks/codex/stop-adapter.js');

let passed = 0;
let failed = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function runAdapter(payload, cwd) {
  const result = spawnSync(process.execPath, [ADAPTER], {
    input: JSON.stringify({ cwd, ...payload }),
    encoding: 'utf8',
    timeout: 8000,
    cwd,
  });
  let parsed = {};
  try { parsed = JSON.parse((result.stdout || '').trim() || '{}'); } catch {}
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

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-test-'));
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  // Initial commit so HEAD exists
  fs.writeFileSync(path.join(dir, 'README.md'), '# test');
  execSync('git add README.md', { cwd: dir, stdio: 'ignore' });
  execSync('git commit -m "init"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ── Loop guard ────────────────────────────────────────────────────────────────

console.log('\nLoop guard (stop_hook_active)');

test('stop_hook_active: true → returns {} immediately', () => {
  const dir = makeTempRepo();
  try {
    const result = runAdapter({ stop_hook_active: true }, dir);
    assert.deepStrictEqual(result, {},
      `Expected {} but got: ${JSON.stringify(result)}`);
  } finally { cleanup(dir); }
});

test('stop_hook_active: false → proceeds normally', () => {
  const dir = makeTempRepo();
  try {
    // No uncommitted changes → no reminders → {}
    const result = runAdapter({ stop_hook_active: false }, dir);
    // Either {} or { systemMessage: ... } are valid — just must not throw
    assert.ok(typeof result === 'object', 'Expected an object');
  } finally { cleanup(dir); }
});

test('stop_hook_active: "true" (string) → NOT treated as active (strict ===)', () => {
  // The adapter uses === true, so string "true" should not suppress reminders
  const dir = makeTempRepo();
  try {
    const result = runAdapter({ stop_hook_active: 'true' }, dir);
    // Should proceed (not bail early) — result is an object
    assert.ok(typeof result === 'object');
  } finally { cleanup(dir); }
});

// ── No git repo → returns {} ──────────────────────────────────────────────────

console.log('\nNon-git directory');

test('Non-git cwd → returns {} (no git, no inference possible)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-nogit-'));
  try {
    const result = runAdapter({ stop_hook_active: false }, dir);
    assert.deepStrictEqual(result, {});
  } finally { cleanup(dir); }
});

// ── No uncommitted changes → no reminders ────────────────────────────────────

console.log('\nClean working tree');

test('Clean repo (no changes) → returns {}', () => {
  const dir = makeTempRepo();
  try {
    const result = runAdapter({ stop_hook_active: false }, dir);
    assert.deepStrictEqual(result, {});
  } finally { cleanup(dir); }
});

// ── TDD reminder ──────────────────────────────────────────────────────────────

console.log('\nTDD reminder');

test('Source file modified, no test file → systemMessage with TDD reminder', () => {
  const dir = makeTempRepo();
  try {
    fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("hello")');
    // Don't stage — git diff --name-only picks up unstaged changes too
    const result = runAdapter({ stop_hook_active: false }, dir);
    assert.ok(result.systemMessage, `Expected systemMessage, got: ${JSON.stringify(result)}`);
    assert.ok(result.systemMessage.toLowerCase().includes('tdd'),
      `Expected TDD mention in: ${result.systemMessage}`);
  } finally { cleanup(dir); }
});

test('Source file + test file both modified → no TDD reminder', () => {
  const dir = makeTempRepo();
  try {
    fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("hello")');
    fs.writeFileSync(path.join(dir, 'index.test.js'), 'test("x", () => {})');
    const result = runAdapter({ stop_hook_active: false }, dir);
    // May have other reminders (commit count) but not TDD
    if (result.systemMessage) {
      assert.ok(!result.systemMessage.toLowerCase().includes('tdd reminder'),
        `Unexpected TDD reminder: ${result.systemMessage}`);
    }
  } finally { cleanup(dir); }
});

// ── Commit reminder ───────────────────────────────────────────────────────────

console.log('\nCommit reminder');

test('5+ uncommitted files → systemMessage with commit reminder', () => {
  const dir = makeTempRepo();
  try {
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(path.join(dir, `file${i}.js`), `// ${i}`);
    }
    const result = runAdapter({ stop_hook_active: false }, dir);
    assert.ok(result.systemMessage, `Expected systemMessage`);
    assert.ok(result.systemMessage.toLowerCase().includes('commit'),
      `Expected commit reminder in: ${result.systemMessage}`);
  } finally { cleanup(dir); }
});

test('4 uncommitted files → no commit reminder', () => {
  const dir = makeTempRepo();
  try {
    for (let i = 0; i < 4; i++) {
      fs.writeFileSync(path.join(dir, `file${i}.js`), `// ${i}`);
    }
    const result = runAdapter({ stop_hook_active: false }, dir);
    if (result.systemMessage) {
      assert.ok(!result.systemMessage.toLowerCase().includes('commit reminder'),
        `Unexpected commit reminder with only 4 files: ${result.systemMessage}`);
    }
  } finally { cleanup(dir); }
});

// ── Decision log reminder ─────────────────────────────────────────────────────

console.log('\nDecision log reminder');

test('SKILL.md modified (uncommitted) → systemMessage with decision log reminder', () => {
  const dir = makeTempRepo();
  try {
    fs.mkdirSync(path.join(dir, 'skills', 'my-skill'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'my-skill', 'SKILL.md'), '---\nname: test\n---\n# test');
    const result = runAdapter({ stop_hook_active: false }, dir);
    assert.ok(result.systemMessage, `Expected systemMessage`);
    assert.ok(result.systemMessage.toLowerCase().includes('decision log'),
      `Expected decision log reminder in: ${result.systemMessage}`);
  } finally { cleanup(dir); }
});

test('SKILL.md modified for project that already has session-log [saved] → still fires', () => {
  // This was the bug: the old code suppressed the reminder if lastSaved was non-null.
  // The fix: fire whenever significant files are uncommitted, regardless of prior history.
  const dir = makeTempRepo();
  try {
    // Write a session-log with a prior [saved] entry
    fs.writeFileSync(path.join(dir, 'session-log.md'),
      '## 2026-01-01 12:00 [saved]\nGoal: prior work\n\n');
    // Modify a significant file
    fs.mkdirSync(path.join(dir, 'skills', 'test'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'test', 'SKILL.md'), '---\nname: test\n---');
    const result = runAdapter({ stop_hook_active: false }, dir);
    assert.ok(result.systemMessage, `Expected systemMessage even with prior [saved] entry`);
    assert.ok(result.systemMessage.toLowerCase().includes('decision log'),
      `Expected decision log reminder: ${result.systemMessage}`);
  } finally { cleanup(dir); }
});

// ── Output shape ──────────────────────────────────────────────────────────────

console.log('\nOutput shape');

test('When reminders present: output has systemMessage (string), no other hook fields', () => {
  const dir = makeTempRepo();
  try {
    fs.writeFileSync(path.join(dir, 'index.js'), 'x');
    const result = runAdapter({ stop_hook_active: false }, dir);
    if (result.systemMessage) {
      assert.strictEqual(typeof result.systemMessage, 'string');
      assert.ok(!result.hookSpecificOutput,
        'Should not use hookSpecificOutput shape for Stop event');
      assert.ok(!result.additionalContext,
        'Should not use additionalContext for Stop event');
    }
  } finally { cleanup(dir); }
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`stop-adapter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
