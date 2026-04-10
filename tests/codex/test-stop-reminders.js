#!/usr/bin/env node
/**
 * Unit tests — hooks/stop-reminders.js (Claude Stop hook path)
 *
 * Validates the Stop output shape expected by Claude Code and guard behavior.
 * Run: node tests/codex/test-stop-reminders.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK_MODULE_PATH = path.join(__dirname, '../../hooks/stop-reminders.js');

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

function makeTempDirs() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-stop-home-'));
  const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-stop-cwd-'));
  const logDir = path.join(homeDir, '.claude', 'hooks-logs');
  fs.mkdirSync(logDir, { recursive: true });
  return { homeDir, cwdDir, logDir };
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for temp test dirs
    }
  }
}

function loadHookWithHome(homeDir) {
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;

  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  delete require.cache[require.resolve(HOOK_MODULE_PATH)];
  const hook = require(HOOK_MODULE_PATH);

  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;

  if (prevUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = prevUserProfile;

  return hook;
}

function writeRecentEdit(logDir, filePath) {
  const line = `${new Date().toISOString()} | Edit | ${filePath}\n`;
  fs.writeFileSync(path.join(logDir, 'edit-log.txt'), line, 'utf8');
}

console.log('\nStop reminders output contract (Claude)');

test('Test-file detection recognizes tests/codex/test-*.js naming', () => {
  const { homeDir } = makeTempDirs();
  try {
    const { isTestFile } = loadHookWithHome(homeDir);
    assert.strictEqual(isTestFile('tests/codex/test-stop-reminders.js'), true,
      'Expected test-*.js under tests/ to be classified as a test file');
  } finally {
    cleanup(homeDir);
  }
});

test('When reminders exist: emits decision+reason, not Stop hookSpecificOutput', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'src/index.js');
    const { evaluatePayload } = loadHookWithHome(homeDir);

    const result = evaluatePayload({ cwd: cwdDir });

    assert.strictEqual(result.decision, 'block',
      `Expected decision=block, got: ${JSON.stringify(result)}`);
    assert.strictEqual(typeof result.reason, 'string',
      `Expected reason string, got: ${JSON.stringify(result)}`);
    assert.ok(result.reason.includes('<stop-hook-reminders>'),
      `Expected stop reminders tag in reason: ${result.reason}`);
    assert.ok(!result.hookSpecificOutput,
      `Stop output must not include hookSpecificOutput: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Active guard suppresses reminder output', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'src/index.js');
    fs.writeFileSync(path.join(logDir, 'stop-hook-fired.lock'), new Date().toISOString(), 'utf8');
    const { evaluatePayload } = loadHookWithHome(homeDir);

    const result = evaluatePayload({ cwd: cwdDir });
    assert.deepStrictEqual(result, {},
      `Expected empty output while guard is active, got: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('No reminders available emits {}', () => {
  const { homeDir, cwdDir } = makeTempDirs();
  try {
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir });
    assert.deepStrictEqual(result, {},
      `Expected empty output without reminders, got: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`stop-reminders: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
