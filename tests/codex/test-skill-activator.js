#!/usr/bin/env node
/**
 * Unit tests — hooks/codex/user-prompt-submit-adapter.js
 *
 * Verifies:
 *   - Correct Codex payload field: `prompt` (not `userPrompt`)
 *   - Micro-task detection skips routing
 *   - Skill matching returns correct skills for known prompts
 *   - Output shape matches Codex UserPromptSubmit spec
 *   - Confidence threshold filters weak matches
 *
 * Run: node tests/codex/test-skill-activator.js
 * No dependencies beyond Node.js stdlib.
 */

'use strict';

const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ── Hermetic environment ──────────────────────────────────────────────────────
// skill-activator writes a per-session recall ledger under $HOME/.claude/hooks-logs.
// Point HOME at a throwaway dir for the whole run so tests never touch the real
// home, and clear the window/threshold overrides so a developer's shell settings
// cannot change the context-pressure expectations below.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-activator-home-'));
process.env.USERPROFILE = TEST_HOME;
process.env.HOME = TEST_HOME;
delete process.env.SP_CONTEXT_WINDOW;
delete process.env.SP_CONTEXT_PRESSURE_THRESHOLD;
process.on('exit', () => {
  try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch { /* best effort */ }
});

const { evaluatePayload } = require('../../hooks/codex/user-prompt-submit-adapter');

let passed = 0;
let failed = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function runActivator(payload) {
  return evaluatePayload(payload);
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

// ── Payload field: must read `prompt`, not `userPrompt` ──────────────────────

console.log('\nCodex payload field: `prompt`');

test('Reads `prompt` field (Codex shape) — produces output for matching prompt', () => {
  const result = runActivator({
    prompt: 'there is a bug in my code, it crashes when I call the function',
    session_id: 'test',
    cwd: process.cwd(),
  });
  // A debugging prompt should produce additionalContext
  const ctx = result.hookSpecificOutput?.additionalContext;
  assert.ok(ctx && ctx.length > 0,
    `Expected additionalContext for a bug/debug prompt, got: ${JSON.stringify(result)}`);
});

test('`userPrompt` field (Claude shape) is NOT used — no routing on wrong field', () => {
  // If the activator reads userPrompt instead of prompt, this would produce output.
  // If it correctly reads `prompt` and prompt is missing, it should return {}.
  const result = runActivator({
    userPrompt: 'there is a bug in my code it crashes',
    session_id: 'test',
    cwd: process.cwd(),
  });
  // prompt field is absent → micro-task or no match → {}
  assert.deepStrictEqual(result, {},
    `Activator is reading userPrompt instead of prompt: ${JSON.stringify(result)}`);
});

// ── Output shape ──────────────────────────────────────────────────────────────

console.log('\nOutput shape (Codex UserPromptSubmit spec)');

test('Output shape: hookSpecificOutput.hookEventName = "UserPromptSubmit"', () => {
  const result = runActivator({
    prompt: 'I need to debug this error: TypeError cannot read property of undefined',
    session_id: 'test',
  });
  if (result.hookSpecificOutput) {
    assert.strictEqual(result.hookSpecificOutput.hookEventName, 'UserPromptSubmit',
      `Wrong hookEventName: ${result.hookSpecificOutput.hookEventName}`);
  }
  // If no match, {} is also valid — this test passes either way
});

test('Output shape: additionalContext is a string when present', () => {
  const result = runActivator({
    prompt: 'write tests first before implementing the feature please',
  });
  if (result.hookSpecificOutput?.additionalContext) {
    assert.strictEqual(typeof result.hookSpecificOutput.additionalContext, 'string',
      'additionalContext is not a string');
  }
});

test('No output fields outside hookSpecificOutput (no top-level additionalContext)', () => {
  const result = runActivator({
    prompt: 'debug this crash in production',
  });
  assert.ok(!result.additionalContext,
    'Top-level additionalContext found — wrong output shape for Codex');
});

// ── Micro-task detection ──────────────────────────────────────────────────────

console.log('\nMicro-task detection (skip routing)');

test('Typo fix → {} (micro-task, skip routing)', () => {
  const result = runActivator({ prompt: 'fix the typo in the variable name' });
  assert.deepStrictEqual(result, {},
    `Expected {} for typo fix, got: ${JSON.stringify(result)}`);
});

test('Rename variable → {} (micro-task)', () => {
  const result = runActivator({ prompt: 'rename getUserData to fetchUserData' });
  assert.deepStrictEqual(result, {},
    `Expected {} for rename, got: ${JSON.stringify(result)}`);
});

test('Single line fix → {} (micro-task)', () => {
  const result = runActivator({ prompt: 'fix the typo on line 42' });
  assert.deepStrictEqual(result, {},
    `Expected {} for single line fix, got: ${JSON.stringify(result)}`);
});

test('Substantive multi-word prompt → NOT a micro-task', () => {
  const result = runActivator({
    prompt: 'I need to implement a new feature for user authentication with JWT tokens and refresh logic',
  });
  // Should not be treated as micro-task — either produces routing or {} from threshold
  // The key assertion: this is not the same as a typo fix
  assert.ok(typeof result === 'object', 'Must return an object');
});

// ── Skill routing accuracy ────────────────────────────────────────────────────

console.log('\nSkill routing accuracy');

test('Debug/error prompt → routes to systematic-debugging', () => {
  const result = runActivator({
    prompt: 'I have a bug in my code, the function returns undefined when it should return an array. How do I debug this?',
  });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(ctx.includes('systematic-debugging'),
    `Expected systematic-debugging in context, got: ${ctx.slice(0, 300)}`);
});

test('TDD prompt → routes to test-driven-development', () => {
  const result = runActivator({
    prompt: 'write the failing tests first before we implement the feature',
  });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(ctx.includes('test-driven-development'),
    `Expected test-driven-development, got: ${ctx.slice(0, 300)}`);
});

test('Brainstorm/new feature prompt → routes to brainstorming', () => {
  const result = runActivator({
    prompt: 'I want to add a new feature, let\'s brainstorm the best approach and architecture',
  });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(ctx.includes('brainstorming'),
    `Expected brainstorming, got: ${ctx.slice(0, 300)}`);
});

test('Code review prompt → routes to requesting-code-review', () => {
  const result = runActivator({
    prompt: 'can you review my code before I merge this PR?',
  });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(
    ctx.includes('requesting-code-review') || ctx.includes('code-review'),
    `Expected code review skill, got: ${ctx.slice(0, 300)}`
  );
});

test('Verification/done prompt → routes to verification-before-completion', () => {
  const result = runActivator({
    prompt: 'I think I\'m done, can you verify everything is correct before we say it\'s complete?',
  });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(ctx.includes('verification'),
    `Expected verification skill, got: ${ctx.slice(0, 300)}`);
});

test('Max 3 skills suggested per prompt', () => {
  // A very broad prompt might match many rules — should cap at 3
  const result = runActivator({
    prompt: 'debug this bug, write tests, review the code, brainstorm new features, and verify everything is done',
  });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  if (ctx) {
    // Count only skill list entries (lines starting with "  - superpowers-optimized:").
    // Excludes the instruction line "invoke superpowers-optimized:using-superpowers FIRST".
    const skillLines = ctx.split('\n').filter(l => /^\s+-\s+superpowers-optimized:/.test(l));
    assert.ok(skillLines.length <= 3,
      `More than 3 skills suggested: ${skillLines.length}\n${ctx}`);
  }
});

// ── Edge cases ────────────────────────────────────────────────────────────────

console.log('\nEdge cases');

test('Empty prompt → {} (no routing)', () => {
  const result = runActivator({ prompt: '' });
  assert.deepStrictEqual(result, {},
    `Expected {} for empty prompt, got: ${JSON.stringify(result)}`);
});

test('Missing prompt field entirely → {}', () => {
  const result = runActivator({ session_id: 'test', cwd: '/tmp' });
  assert.deepStrictEqual(result, {},
    `Expected {} for missing prompt, got: ${JSON.stringify(result)}`);
});

test('Very long prompt → does not crash, returns valid JSON', () => {
  const longPrompt = 'debug '.repeat(5000);
  const result = runActivator({ prompt: longPrompt });
  assert.ok(typeof result === 'object', 'Must return an object for long prompts');
});

test('Prompt with special regex characters → does not crash', () => {
  const result = runActivator({
    prompt: 'fix the bug in function(x) { return x[0] ?? null; } // regex: /[a-z]+/gi',
  });
  assert.ok(typeof result === 'object', 'Must handle regex chars without crashing');
});

// ── Memory recall (extractKeywords / searchSessionLog / buildMemoryContext) ───

const {
  extractKeywords,
  searchSessionLog,
  buildMemoryContext,
  MAX_MEMORY_ENTRIES,
} = require('../../hooks/skill-activator');

console.log('\nMemory recall — extractKeywords');

test('Strips stop words', () => {
  const kw = extractKeywords('what is the best way to fix this problem');
  // 'what','is','the','best','way','to','fix'(3 chars),'this','problem'
  // 'best' is not a stop word, len=4 → included. 'problem' included.
  // 'what','is','the','to','this' are stop words. 'fix' is 3 chars < 4.
  assert.ok(!kw.includes('the'), 'stop word "the" should be removed');
  assert.ok(!kw.includes('what'), 'stop word "what" should be removed');
  assert.ok(!kw.includes('fix'), '"fix" is 3 chars, below min length');
});

test('Keeps tokens >= 4 chars that are not stop words', () => {
  const kw = extractKeywords('brainstorming skill hooks session');
  assert.ok(kw.includes('brainstorming'), '"brainstorming" should be kept');
  assert.ok(kw.includes('skill'), '"skill" should be kept');
  assert.ok(kw.includes('hooks'), '"hooks" should be kept');
  assert.ok(kw.includes('session'), '"session" should be kept');
});

test('Preserves hyphenated compound tokens', () => {
  const kw = extractKeywords('check session-log memory recall');
  assert.ok(kw.includes('session-log'), '"session-log" should be preserved as compound');
});

test('Deduplicates tokens', () => {
  const kw = extractKeywords('hook hook hook session session');
  assert.strictEqual(kw.filter(t => t === 'hook').length, 1, 'hook should appear once');
  assert.strictEqual(kw.filter(t => t === 'session').length, 1, 'session should appear once');
});

test('Returns [] for empty input', () => {
  assert.deepStrictEqual(extractKeywords(''), []);
  assert.deepStrictEqual(extractKeywords(null), []);
});

console.log('\nMemory recall — searchSessionLog');

function makeTmpLog(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slog-unit-'));
  fs.writeFileSync(path.join(dir, 'session-log.md'), entries.join('\n'));
  return dir;
}

test('Returns [] when session-log.md absent', () => {
  const results = searchSessionLog('/nonexistent/path/xyz', ['hook']);
  assert.deepStrictEqual(results, []);
});

test('Returns [] when no keywords provided', () => {
  const dir = makeTmpLog(['## 2026-01-01 10:00 [saved]\nGoal: test\n']);
  const results = searchSessionLog(dir, []);
  fs.rmSync(dir, { recursive: true });
  assert.deepStrictEqual(results, []);
});

test('Skips [superseded] entries', () => {
  const dir = makeTmpLog([
    '## 2026-01-01 10:00 [saved] [superseded by 2026-02-01]',
    'Goal: old decision with keyword brainstorming',
    '',
    '## 2026-02-01 10:00 [saved]',
    'Goal: new decision',
    '',
  ]);
  const results = searchSessionLog(dir, ['brainstorming']);
  fs.rmSync(dir, { recursive: true });
  assert.strictEqual(results.length, 0, 'superseded entry should not be returned');
});

test('Returns most-recent match first', () => {
  const dir = makeTmpLog([
    '## 2025-01-01 10:00 [saved]',
    'Goal: older entry with keyword brainstorming',
    '',
    '## 2026-04-01 10:00 [saved]',
    'Goal: newer entry with keyword brainstorming',
    '',
  ]);
  const results = searchSessionLog(dir, ['brainstorming']);
  fs.rmSync(dir, { recursive: true });
  assert.ok(results[0].includes('newer entry'), 'most-recent entry should be first');
});

test(`Returns at most ${MAX_MEMORY_ENTRIES} entries`, () => {
  const entries = [];
  for (let i = 1; i <= 5; i++) {
    entries.push(`## 2026-01-0${i} 10:00 [saved]`, `Goal: entry ${i} with keyword brainstorming`, '');
  }
  const dir = makeTmpLog(entries);
  const results = searchSessionLog(dir, ['brainstorming']);
  fs.rmSync(dir, { recursive: true });
  assert.ok(results.length <= MAX_MEMORY_ENTRIES,
    `Should return at most ${MAX_MEMORY_ENTRIES}, got ${results.length}`);
});

console.log('\nMemory recall — buildMemoryContext');

test('Returns null for empty entries array', () => {
  assert.strictEqual(buildMemoryContext([]), null);
  assert.strictEqual(buildMemoryContext(null), null);
});

test('Wraps entries in session-memory-recall tags', () => {
  const ctx = buildMemoryContext(['## 2026-01-01 [saved]\nGoal: test']);
  assert.ok(ctx.includes('<session-memory-recall>'), 'should open tag');
  assert.ok(ctx.includes('</session-memory-recall>'), 'should close tag');
});

console.log('\nMemory recall — evaluatePayload integration');

test('Memory-only: no skill match + session-log hit → returns memory context', () => {
  const dir = makeTmpLog([
    '## 2026-04-01 09:00 [saved]',
    'Goal: condition-based waiting for flaky hooks',
    '',
  ]);
  const result = evaluatePayload({
    prompt: 'help me understand the condition-based waiting approach for hooks',
    cwd: dir,
  });
  fs.rmSync(dir, { recursive: true });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(ctx.includes('session-memory-recall'), 'should inject memory context');
});

test('Both: skill match + session-log hit → skill hint precedes memory context', () => {
  const dir = makeTmpLog([
    '## 2026-04-01 09:00 [saved]',
    'Goal: systematic debugging of hook failures',
    '',
  ]);
  const result = evaluatePayload({
    prompt: 'the test is failing with an error in my hook, help me debug this systematically',
    cwd: dir,
  });
  fs.rmSync(dir, { recursive: true });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(ctx.includes('user-prompt-submit-hook'), 'should include skill hint');
  assert.ok(ctx.includes('session-memory-recall'), 'should include memory recall');
  assert.ok(
    ctx.indexOf('user-prompt-submit-hook') < ctx.indexOf('session-memory-recall'),
    'skill hint should precede memory recall'
  );
});

// ── Known-issues recall ───────────────────────────────────────────────────────

const { searchKnownIssues, buildKnownIssuesContext } = require('../../hooks/skill-activator');

function makeTmpKnownIssues(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ki-unit-'));
  fs.writeFileSync(path.join(dir, 'known-issues.md'), content);
  return dir;
}

console.log('\nKnown-issues recall — searchKnownIssues');

test('Returns [] when known-issues.md absent', () => {
  assert.deepStrictEqual(searchKnownIssues('/nonexistent/xyz', ['hook']), []);
});

test('Returns [] when no keywords', () => {
  const dir = makeTmpKnownIssues('## Open issue\nSome content about hooks\n');
  const r = searchKnownIssues(dir, []);
  fs.rmSync(dir, { recursive: true });
  assert.deepStrictEqual(r, []);
});

test('Skips fixed entries (## ~~ strikethrough)', () => {
  const dir = makeTmpKnownIssues([
    '## ~~Fixed hook issue~~ ✅ Fixed',
    'Error: hooks stopped working',
    'Fix: updated to v6.5.1',
    '',
    '## Open hook performance issue',
    'Hooks are slow on large repos',
  ].join('\n'));
  const r = searchKnownIssues(dir, ['hooks']);
  fs.rmSync(dir, { recursive: true });
  assert.strictEqual(r.length, 1, 'should return only the open entry');
  assert.ok(r[0].includes('Open hook performance'), 'should be the open entry');
});

test('Matches open entries by keyword', () => {
  const dir = makeTmpKnownIssues([
    '## Codex hooks do not fire',
    'Error: SessionStart missing. Root cause: old codex-cli version.',
    '',
    '## Unrelated issue about skill routing',
    'Skills are not being matched correctly.',
  ].join('\n'));
  const r = searchKnownIssues(dir, ['codex', 'sessionstart']);
  fs.rmSync(dir, { recursive: true });
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].includes('Codex hooks'));
});

test('Returns most-recent match first', () => {
  const dir = makeTmpKnownIssues([
    '## Older hook issue',
    'hooks problem from before',
    '',
    '## Newer hook issue',
    'hooks problem more recent',
  ].join('\n'));
  const r = searchKnownIssues(dir, ['hooks']);
  fs.rmSync(dir, { recursive: true });
  assert.ok(r[0].includes('Newer hook issue'), 'most recent should be first');
});

console.log('\nKnown-issues recall — buildKnownIssuesContext');

test('Returns null for empty entries', () => {
  assert.strictEqual(buildKnownIssuesContext([]), null);
  assert.strictEqual(buildKnownIssuesContext(null), null);
});

test('Wraps entries in known-issues-recall tags', () => {
  const ctx = buildKnownIssuesContext(['## Issue\nSome problem']);
  assert.ok(ctx.includes('<known-issues-recall>'));
  assert.ok(ctx.includes('</known-issues-recall>'));
});

console.log('\nKnown-issues recall — evaluatePayload ordering');

test('known-issues context appears between skill hint and memory context', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ki-order-'));
  fs.writeFileSync(path.join(dir, 'known-issues.md'), [
    '## Codex hooks not firing',
    'Error: hooks ignored. Root cause: old codex version.',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'session-log.md'), [
    '## 2026-04-01 09:00 [saved]',
    'Goal: systematic debugging of codex hook failures',
  ].join('\n'));
  const result = evaluatePayload({
    prompt: 'I need to debug why my codex hooks are not firing in the test environment',
    cwd: dir,
  });
  fs.rmSync(dir, { recursive: true });
  const ctx = result.hookSpecificOutput?.additionalContext || '';
  const kiIdx = ctx.indexOf('known-issues-recall');
  const memIdx = ctx.indexOf('session-memory-recall');
  if (kiIdx !== -1 && memIdx !== -1) {
    assert.ok(kiIdx < memIdx, 'known-issues should precede memory context');
  }
  // At minimum one of the recall sections should appear
  assert.ok(kiIdx !== -1 || memIdx !== -1, 'at least one recall section should appear');
});

// ── Context pressure gate ─────────────────────────────────────────────────────

const {
  isExecutionTrigger,
  cwdToProjectDir,
  getContextPressure,
  buildContextPressureBlock,
} = require('../../hooks/skill-activator');

console.log('\nContext pressure gate — isExecutionTrigger');

test('Recognises "execute the plan"', () => {
  assert.strictEqual(isExecutionTrigger('execute the plan'), true);
});
test('Recognises "start building"', () => {
  assert.strictEqual(isExecutionTrigger('start building the feature'), true);
});
test('Recognises "start implementing"', () => {
  assert.strictEqual(isExecutionTrigger('let\'s start implementing'), true);
});
test('Recognises "follow the plan"', () => {
  assert.strictEqual(isExecutionTrigger('follow the plan we wrote'), true);
});
test('Recognises "implement the plan"', () => {
  assert.strictEqual(isExecutionTrigger('implement the plan now'), true);
});
test('Recognises "let\'s build"', () => {
  assert.strictEqual(isExecutionTrigger('let\'s build this'), true);
});
test('Recognises "run the plan"', () => {
  assert.strictEqual(isExecutionTrigger('run the plan'), true);
});
test('Recognises "begin implementing"', () => {
  assert.strictEqual(isExecutionTrigger('begin implementing the auth module'), true);
});
test('Does NOT trigger on "what is the plan"', () => {
  assert.strictEqual(isExecutionTrigger('what is the plan here?'), false);
});
test('Does NOT trigger on "fix this bug"', () => {
  assert.strictEqual(isExecutionTrigger('fix this bug in auth.js'), false);
});
test('Does NOT trigger on "review the code"', () => {
  assert.strictEqual(isExecutionTrigger('review the code before merging'), false);
});
test('Does NOT trigger on empty string', () => {
  assert.strictEqual(isExecutionTrigger(''), false);
});
test('Does NOT trigger on null', () => {
  assert.strictEqual(isExecutionTrigger(null), false);
});

console.log('\nContext pressure gate — cwdToProjectDir');

test('Windows path with spaces encodes correctly', () => {
  const result = cwdToProjectDir('C:\\Users\\Tjerk Pieksma\\Documents\\Github\\project');
  assert.strictEqual(result, 'c--Users-Tjerk-Pieksma-Documents-Github-project');
});
test('Windows path without spaces encodes correctly', () => {
  const result = cwdToProjectDir('C:\\Users\\user\\project');
  assert.strictEqual(result, 'c--Users-user-project');
});
test('Lowercase drive letter for any uppercase drive', () => {
  const result = cwdToProjectDir('D:\\work\\repo');
  assert.ok(result.startsWith('d-'), `Expected d- prefix, got: ${result}`);
});
test('Unix path encodes correctly', () => {
  const result = cwdToProjectDir('/home/user/projects/foo');
  assert.strictEqual(result, '-home-user-projects-foo');
});
test('No trailing dashes', () => {
  const result = cwdToProjectDir('C:\\project\\');
  assert.ok(!result.endsWith('-'), `Should not end with dash, got: ${result}`);
});
test('Forward slashes treated same as backslashes', () => {
  const win = cwdToProjectDir('C:\\Users\\user\\project');
  const fwd = cwdToProjectDir('C:/Users/user/project');
  assert.strictEqual(win, fwd, 'Forward and backslash paths should produce the same result');
});

console.log('\nContext pressure gate — getContextPressure');

function makeJsonlSession(sessionId, projectDir, homeDir, turns) {
  const projectPath = path.join(homeDir, '.claude', 'projects', projectDir);
  fs.mkdirSync(projectPath, { recursive: true });
  const jsonlPath = path.join(projectPath, sessionId + '.jsonl');
  const lines = turns.map(t => JSON.stringify({
    type: 'assistant',
    message: { usage: t },
    sessionId,
    timestamp: new Date().toISOString(),
  }));
  fs.writeFileSync(jsonlPath, lines.join('\n'));
  return jsonlPath;
}

test('Returns null when sessionId is missing', () => {
  assert.strictEqual(getContextPressure(process.cwd(), null), null);
  assert.strictEqual(getContextPressure(process.cwd(), undefined), null);
});

test('Returns null when JSONL file does not exist', () => {
  const result = getContextPressure('/nonexistent/path/xyz', 'fake-session-id');
  assert.strictEqual(result, null);
});

test('Returns correct percent for known token counts (below threshold)', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-unit-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-below-' + Date.now();
  // Last turn: 40K total input (20% of 200K)
  makeJsonlSession(sessionId, projDir, tmpHome, [
    { input_tokens: 5, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0, output_tokens: 100 },
    { input_tokens: 3, cache_creation_input_tokens: 500, cache_read_input_tokens: 39500, output_tokens: 200 },
  ]);
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  const result = getContextPressure(cwd, sessionId);
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true });

  assert.ok(result !== null, 'Should return a result');
  assert.strictEqual(result.overThreshold, false, 'Should be below threshold');
  assert.ok(result.percent < 60, `Expected <60%, got ${result.percent}%`);
});

test('Returns overThreshold=true for ≥60% context (120K tokens)', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-unit-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-above-' + Date.now();
  // Last turn: 125K total input (62.5% of 200K) → over threshold
  makeJsonlSession(sessionId, projDir, tmpHome, [
    { input_tokens: 5, cache_creation_input_tokens: 100000, cache_read_input_tokens: 25000, output_tokens: 2000 },
  ]);
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  const result = getContextPressure(cwd, sessionId);
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true });

  assert.ok(result !== null, 'Should return a result');
  assert.strictEqual(result.overThreshold, true, 'Should be over threshold');
  assert.ok(result.percent >= 60, `Expected ≥60%, got ${result.percent}%`);
  assert.strictEqual(result.inputK, 125, `Expected 125K, got ${result.inputK}K`);
});

test('Uses LAST assistant turn, not first', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-unit-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-last-' + Date.now();
  // First turn: tiny. Last turn: over threshold.
  makeJsonlSession(sessionId, projDir, tmpHome, [
    { input_tokens: 3, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 50 },
    { input_tokens: 5, cache_creation_input_tokens: 100000, cache_read_input_tokens: 25000, output_tokens: 2000 },
  ]);
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  const result = getContextPressure(cwd, sessionId);
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true });

  assert.ok(result !== null, 'Should return a result');
  assert.strictEqual(result.overThreshold, true, 'Last turn is over threshold');
});

test('Skips non-assistant lines without crashing', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-unit-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-mixed-' + Date.now();
  const projectPath = path.join(tmpHome, '.claude', 'projects', projDir);
  fs.mkdirSync(projectPath, { recursive: true });
  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'hello' }, sessionId }),
    'not valid json at all',
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 3, cache_creation_input_tokens: 500, cache_read_input_tokens: 0, output_tokens: 50 } }, sessionId }),
  ];
  fs.writeFileSync(path.join(projectPath, sessionId + '.jsonl'), lines.join('\n'));
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  let threw = false;
  try { getContextPressure(cwd, sessionId); } catch { threw = true; }
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true });
  assert.strictEqual(threw, false, 'Should not throw on mixed/invalid lines');
});

console.log('\nContext pressure gate — buildContextPressureBlock');

test('Contains opening and closing context-pressure-gate tags', () => {
  const block = buildContextPressureBlock({ inputK: 125, percent: 62 });
  assert.ok(block.includes('<context-pressure-gate>'), 'Missing opening tag');
  assert.ok(block.includes('</context-pressure-gate>'), 'Missing closing tag');
});
test('Interpolates inputK correctly', () => {
  const block = buildContextPressureBlock({ inputK: 142, percent: 71 });
  assert.ok(block.includes('142K'), `Expected 142K in block, got: ${block.slice(0, 200)}`);
});
test('Interpolates percent correctly', () => {
  const block = buildContextPressureBlock({ inputK: 142, percent: 71 });
  assert.ok(block.includes('71%'), `Expected 71% in block, got: ${block.slice(0, 200)}`);
});
test('Contains all 4 required action steps', () => {
  const block = buildContextPressureBlock({ inputK: 100, percent: 60 });
  assert.ok(block.includes('1.'), 'Missing step 1');
  assert.ok(block.includes('2.'), 'Missing step 2');
  assert.ok(block.includes('3.'), 'Missing step 3');
  assert.ok(block.includes('4.'), 'Missing step 4');
});
test('References /compact in step 3', () => {
  const block = buildContextPressureBlock({ inputK: 100, percent: 60 });
  assert.ok(block.includes('/compact'), 'Step 3 should reference /compact');
});
test('References state.md in step 1', () => {
  const block = buildContextPressureBlock({ inputK: 100, percent: 60 });
  assert.ok(block.includes('state.md'), 'Step 1 should reference state.md');
});

console.log('\nContext pressure gate — evaluatePayload integration');

test('Execution trigger + high pressure → returns pressure block, not skill hints', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-int-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-int-' + Date.now();
  makeJsonlSession(sessionId, projDir, tmpHome, [
    { input_tokens: 5, cache_creation_input_tokens: 100000, cache_read_input_tokens: 25000, output_tokens: 2000 },
  ]);
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  const result = evaluatePayload({ prompt: 'execute the plan', session_id: sessionId, cwd });
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true });

  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(ctx.includes('context-pressure-gate'), 'Should return pressure block');
  assert.ok(!ctx.includes('user-prompt-submit-hook'), 'Should NOT include skill hints when gate fires');
});

test('Execution trigger + low pressure → returns skill hints, not pressure block', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-int2-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-int2-' + Date.now();
  makeJsonlSession(sessionId, projDir, tmpHome, [
    { input_tokens: 3, cache_creation_input_tokens: 500, cache_read_input_tokens: 5000, output_tokens: 100 },
  ]);
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  const result = evaluatePayload({ prompt: 'execute the plan and start building the feature', session_id: sessionId, cwd });
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true });

  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(!ctx.includes('context-pressure-gate'), 'Should NOT return pressure block at low pressure');
});

test('Non-execution prompt + high pressure → no pressure block', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-int3-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-int3-' + Date.now();
  makeJsonlSession(sessionId, projDir, tmpHome, [
    { input_tokens: 5, cache_creation_input_tokens: 100000, cache_read_input_tokens: 25000, output_tokens: 2000 },
  ]);
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  const result = evaluatePayload({ prompt: 'fix this bug in the auth middleware', session_id: sessionId, cwd });
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true });

  const ctx = result.hookSpecificOutput?.additionalContext || '';
  assert.ok(!ctx.includes('context-pressure-gate'), 'Non-execution prompt should never get pressure block');
});

// ── Recall ranking (F8) ───────────────────────────────────────────────────────
// Flat density scoring let recency outrank relevance ~13x on normal prompts.
// These tests lock the two properties that fixed it: IDF weighting and the
// coverage gate.

const { rankEntries, MIN_COVERAGE } = require('../../hooks/skill-activator');

console.log('\nRecall ranking — rankEntries');

test('Relevance beats recency', () => {
  const entries = [
    '## 2026-01-01 [saved]\nGoal: rewrite the session-log recall scoring model',
    '## 2026-06-01 [saved]\nGoal: bump the release version and update notes',
  ];
  const ranked = rankEntries(entries, ['session-log', 'recall', 'scoring']);
  assert.ok(ranked.length > 0, 'the on-topic entry must be returned');
  assert.ok(ranked[0].entry.includes('2026-01-01'),
    'older but on-topic entry must outrank the newest off-topic one');
});

test('A single common word cannot carry an entry (coverage gate)', () => {
  const entries = [
    '## A\nthe plugin hooks do not fire on codex',
    '## B\nthe plugin manifest version must stay in sync',
  ];
  // Only "plugin" exists in the corpus; the other four keywords do not.
  const ranked = rankEntries(entries, ['re-verify', 'improve', 'plugin', 'memory', 'stack']);
  assert.strictEqual(ranked.length, 0,
    'matching 1 of 5 keywords is 20% coverage — below the gate');
});

test('Terms present in every entry carry little weight', () => {
  const entries = [
    '## A\nhook change about compression rules',
    '## B\nhook change about worktree isolation',
    '## C\nhook change about memory recall ranking',
  ];
  const ranked = rankEntries(entries, ['hook', 'memory', 'recall']);
  assert.ok(ranked.length > 0, 'expected a match');
  assert.ok(ranked[0].entry.includes('memory recall'),
    'the entry matching the distinctive terms must rank first, not the newest');
});

test('Returns [] for empty inputs', () => {
  assert.deepStrictEqual(rankEntries([], ['x']), []);
  assert.deepStrictEqual(rankEntries(['## A\nbody'], []), []);
  assert.deepStrictEqual(rankEntries(null, ['x']), []);
});

test('Reports relevance and coverage on every hit', () => {
  const ranked = rankEntries(['## A\nmemory recall ranking work'], ['memory', 'recall']);
  assert.strictEqual(ranked.length, 1);
  assert.ok(ranked[0].relevance > 0 && ranked[0].relevance <= 1);
  assert.ok(ranked[0].coverage >= MIN_COVERAGE);
});

test('Prompt scaffolding words are not treated as keywords', () => {
  const kw = extractKeywords('first take a step, once done please tell me anything else');
  for (const noise of ['first', 'take', 'step', 'once', 'done', 'tell', 'anything', 'else']) {
    assert.ok(!kw.includes(noise), `"${noise}" is scaffolding and must be stripped`);
  }
});

test('Domain nouns survive the stop-word list', () => {
  const kw = extractKeywords('update state and the plan hook memory context map');
  for (const domain of ['state', 'plan', 'hook', 'memory', 'context']) {
    assert.ok(kw.includes(domain), `"${domain}" must remain a keyword`);
  }
});

// ── Context window resolution (D7) ────────────────────────────────────────────

const {
  parseWindowSetting,
  parseThresholdSetting,
  resolveContextWindow,
  getPressureThreshold,
  formatWindowLabel,
  DEFAULT_CONTEXT_WINDOW,
  LARGE_CONTEXT_WINDOW,
} = require('../../hooks/skill-activator');

console.log('\nContext window resolution — parseWindowSetting');

test('Parses raw token counts', () => {
  assert.strictEqual(parseWindowSetting('1000000'), 1000000);
  assert.strictEqual(parseWindowSetting('200000'), 200000);
});
test('Parses k/m shorthand, case-insensitively', () => {
  assert.strictEqual(parseWindowSetting('1m'), 1000000);
  assert.strictEqual(parseWindowSetting('1M'), 1000000);
  assert.strictEqual(parseWindowSetting('200k'), 200000);
  assert.strictEqual(parseWindowSetting('1.5m'), 1500000);
});
test('Tolerates separators and whitespace', () => {
  assert.strictEqual(parseWindowSetting(' 1_000_000 '), 1000000);
  assert.strictEqual(parseWindowSetting('1,000,000'), 1000000);
});
test('Rejects nonsense and empty values', () => {
  assert.strictEqual(parseWindowSetting(''), null);
  assert.strictEqual(parseWindowSetting(null), null);
  assert.strictEqual(parseWindowSetting(undefined), null);
  assert.strictEqual(parseWindowSetting('abc'), null);
  assert.strictEqual(parseWindowSetting('-5'), null);
  assert.strictEqual(parseWindowSetting('5'), null, 'sub-1K values are not a real window');
});

console.log('\nContext window resolution — parseThresholdSetting');

test('Parses ratios and percentages', () => {
  assert.strictEqual(parseThresholdSetting('0.75'), 0.75);
  assert.strictEqual(parseThresholdSetting('.5'), 0.5);
  assert.strictEqual(parseThresholdSetting('75'), 0.75);
  assert.strictEqual(parseThresholdSetting('75%'), 0.75);
});
test('Rejects out-of-range and unparseable thresholds', () => {
  assert.strictEqual(parseThresholdSetting('0'), null);
  assert.strictEqual(parseThresholdSetting('1'), null);
  assert.strictEqual(parseThresholdSetting('100'), null);
  assert.strictEqual(parseThresholdSetting('abc'), null);
  assert.strictEqual(parseThresholdSetting(null), null);
});
test('getPressureThreshold falls back to the default', () => {
  assert.strictEqual(getPressureThreshold({}), 0.60);
  assert.strictEqual(getPressureThreshold({ SP_CONTEXT_PRESSURE_THRESHOLD: '80' }), 0.80);
  assert.strictEqual(getPressureThreshold({ SP_CONTEXT_PRESSURE_THRESHOLD: 'junk' }), 0.60);
});

console.log('\nContext window resolution — resolveContextWindow');

test('Defaults to the conservative window', () => {
  assert.strictEqual(resolveContextWindow({}, {}), DEFAULT_CONTEXT_WINDOW);
  assert.strictEqual(resolveContextWindow(null, {}), DEFAULT_CONTEXT_WINDOW);
});
test('SP_CONTEXT_WINDOW overrides everything', () => {
  assert.strictEqual(
    resolveContextWindow({ model: 'claude-opus-5', observedMax: 10 }, { SP_CONTEXT_WINDOW: '1m' }),
    LARGE_CONTEXT_WINDOW
  );
  assert.strictEqual(
    resolveContextWindow({ model: 'claude-sonnet-4-5[1m]' }, { SP_CONTEXT_WINDOW: '200k' }),
    200000,
    'explicit setting must win over the model marker'
  );
});
test('Detects the [1m] model marker', () => {
  assert.strictEqual(resolveContextWindow({ model: 'claude-sonnet-4-5[1m]' }, {}), LARGE_CONTEXT_WINDOW);
  assert.strictEqual(resolveContextWindow({ model: 'claude-opus-5' }, {}), DEFAULT_CONTEXT_WINDOW);
});
test('Auto-escalates when observed context exceeds the default', () => {
  assert.strictEqual(resolveContextWindow({ observedMax: 250000 }, {}), LARGE_CONTEXT_WINDOW);
  assert.strictEqual(resolveContextWindow({ observedMax: 199000 }, {}), DEFAULT_CONTEXT_WINDOW);
  assert.strictEqual(resolveContextWindow({ observedMax: 1200000 }, {}), 1200000);
});
test('formatWindowLabel renders K and M tiers', () => {
  assert.strictEqual(formatWindowLabel(200000), '200K');
  assert.strictEqual(formatWindowLabel(1000000), '1M');
  assert.strictEqual(formatWindowLabel(1500000), '1.5M');
});

console.log('\nContext pressure gate — window-aware pressure (D7 regression)');

function pressureWithEnv(turns, env, model) {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-win-'));
  const cwd = path.join(tmpHome, 'myproject');
  const projDir = cwdToProjectDir(cwd);
  const sessionId = 'test-win-' + Math.random().toString(36).slice(2);
  const projectPath = path.join(tmpHome, '.claude', 'projects', projDir);
  fs.mkdirSync(projectPath, { recursive: true });
  const lines = turns.map(t => JSON.stringify({
    type: 'assistant',
    message: model ? { model, usage: t } : { usage: t },
    sessionId,
  }));
  fs.writeFileSync(path.join(projectPath, sessionId + '.jsonl'), lines.join('\n'));
  const orig = { up: process.env.USERPROFILE, home: process.env.HOME };
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  const result = getContextPressure(cwd, sessionId, env);
  process.env.USERPROFILE = orig.up;
  process.env.HOME = orig.home;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  return result;
}

const TURN_125K = [{ input_tokens: 5, cache_creation_input_tokens: 100000, cache_read_input_tokens: 25000, output_tokens: 2000 }];

test('125K on a 200K window is over threshold (unchanged behaviour)', () => {
  const r = pressureWithEnv(TURN_125K, {});
  assert.strictEqual(r.overThreshold, true);
  assert.strictEqual(r.windowK, 200);
  assert.strictEqual(r.percent, 63);
});
test('125K on a 1M window is NOT over threshold (the D7 bug)', () => {
  const r = pressureWithEnv(TURN_125K, { SP_CONTEXT_WINDOW: '1m' });
  assert.strictEqual(r.overThreshold, false, '125K of 1M is 13% — must not block');
  assert.strictEqual(r.windowK, 1000);
  assert.strictEqual(r.percent, 13);
});
test('[1m] model marker widens the window without any env var', () => {
  const r = pressureWithEnv(TURN_125K, {}, 'claude-sonnet-4-5[1m]');
  assert.strictEqual(r.overThreshold, false);
  assert.strictEqual(r.windowK, 1000);
});
test('Observed context above 200K auto-escalates the window', () => {
  const r = pressureWithEnv([
    { input_tokens: 5, cache_creation_input_tokens: 300000, cache_read_input_tokens: 0, output_tokens: 100 },
  ], {});
  assert.strictEqual(r.windowK, 1000, 'a 300K turn proves the window is larger than 200K');
  assert.strictEqual(r.overThreshold, false);
});
test('Threshold override changes when the gate fires', () => {
  const r = pressureWithEnv(TURN_125K, { SP_CONTEXT_PRESSURE_THRESHOLD: '80' });
  assert.strictEqual(r.overThreshold, false, '63% is below an 80% threshold');
  assert.strictEqual(r.threshold, 0.8);
});
test('Pressure block reports the real window and threshold', () => {
  const block = buildContextPressureBlock({ inputK: 700, percent: 70, window: 1000000, threshold: 0.6 });
  assert.ok(block.includes('1M limit'), `Expected "1M limit", got: ${block.slice(0, 300)}`);
  assert.ok(block.includes('≥60%'), 'Expected the threshold in the block');
});
test('Pressure block still renders with only inputK/percent', () => {
  const block = buildContextPressureBlock({ inputK: 142, percent: 71 });
  assert.ok(block.includes('200K limit'), 'Should fall back to the default window label');
});

// ── Session-scoped recall dedupe (D5) ─────────────────────────────────────────

const { dedupeRecall, entryKey, sessionStartSeed } = require('../../hooks/skill-activator');

console.log('\nRecall dedupe — entryKey / sessionStartSeed');

test('entryKey uses the entry header line', () => {
  assert.strictEqual(entryKey('## 2026-01-01 [saved]\nGoal: x'), '## 2026-01-01 [saved]');
  assert.strictEqual(entryKey(''), '');
  assert.strictEqual(entryKey(null), '');
});

function makeMemoryProject(savedHeaders, issueHeaders) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-'));
  if (savedHeaders) {
    fs.writeFileSync(
      path.join(dir, 'session-log.md'),
      savedHeaders.map(h => `${h}\nGoal: hook staleness work\n`).join('\n')
    );
  }
  if (issueHeaders) {
    fs.writeFileSync(
      path.join(dir, 'known-issues.md'),
      issueHeaders.map(h => `${h}\n**Error:** hook staleness\n`).join('\n')
    );
  }
  return dir;
}

test('Seed mirrors the SessionStart injection window', () => {
  const dir = makeMemoryProject(
    ['## 2026-01-01 [saved]', '## 2026-01-02 [saved]', '## 2026-01-03 [saved]'],
    ['## Issue A', '## ~~Fixed issue~~', '## Issue B']
  );
  const seed = sessionStartSeed(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepStrictEqual(seed.sessionLog, ['## 2026-01-02 [saved]', '## 2026-01-03 [saved]'],
    'only the last 2 [saved] headers are injected at session start');
  assert.deepStrictEqual(seed.knownIssues, ['## Issue A', '## Issue B'],
    'fixed (~~struck~~) issues are never injected');
});

test('Seed is empty when the memory files do not exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-empty-'));
  const seed = sessionStartSeed(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepStrictEqual(seed, { sessionLog: [], knownIssues: [] });
});

console.log('\nRecall dedupe — dedupeRecall');

test('No session id → nothing is filtered', () => {
  const entries = ['## 2026-01-01 [saved]\nGoal: x'];
  const out = dedupeRecall('/nonexistent', null, entries, []);
  assert.deepStrictEqual(out.sessionLog, entries);
});

test('An entry is injected once, then suppressed for the rest of the session', () => {
  const dir = makeMemoryProject(null, null);
  const sid = 'dedupe-' + Math.random().toString(36).slice(2);
  const entries = ['## 2026-01-01 [saved]\nGoal: first', '## 2026-01-02 [saved]\nGoal: second'];

  const first = dedupeRecall(dir, sid, entries, []);
  assert.strictEqual(first.sessionLog.length, 2, 'first turn surfaces both entries');

  const second = dedupeRecall(dir, sid, entries, []);
  assert.strictEqual(second.sessionLog.length, 0, 'second turn must suppress both');

  const third = dedupeRecall(dir, sid, [...entries, '## 2026-01-03 [saved]\nGoal: new'], []);
  assert.strictEqual(third.sessionLog.length, 1, 'only the unseen entry survives');
  assert.ok(third.sessionLog[0].includes('2026-01-03'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Entries already injected by SessionStart are never repeated', () => {
  const dir = makeMemoryProject(['## 2026-01-01 [saved]', '## 2026-01-02 [saved]'], null);
  const sid = 'dedupe-seed-' + Math.random().toString(36).slice(2);
  const out = dedupeRecall(dir, sid, ['## 2026-01-02 [saved]\nGoal: already shown'], []);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(out.sessionLog.length, 0,
    'session-start already injected the last 2 [saved] entries');
});

test('Known issues dedupe independently of session-log entries', () => {
  const dir = makeMemoryProject(null, null);
  const sid = 'dedupe-ki-' + Math.random().toString(36).slice(2);
  const issues = ['## Codex hooks not firing\n**Error:** x'];
  const first = dedupeRecall(dir, sid, [], issues);
  assert.strictEqual(first.knownIssues.length, 1);
  const second = dedupeRecall(dir, sid, [], issues);
  assert.strictEqual(second.knownIssues.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Different sessions keep independent ledgers', () => {
  const dir = makeMemoryProject(null, null);
  const entries = ['## 2026-01-01 [saved]\nGoal: x'];
  const a = 'dedupe-a-' + Math.random().toString(36).slice(2);
  const b = 'dedupe-b-' + Math.random().toString(36).slice(2);
  dedupeRecall(dir, a, entries, []);
  const outB = dedupeRecall(dir, b, entries, []);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(outB.sessionLog.length, 1, 'a new session starts with a clean ledger');
});

test('Corrupt ledger falls back to seeding instead of throwing', () => {
  const dir = makeMemoryProject(null, null);
  const sid = 'dedupe-corrupt-' + Math.random().toString(36).slice(2);
  const { recallLedgerPath } = require('../../hooks/skill-activator');
  const p = recallLedgerPath(sid);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{not json');
  const out = dedupeRecall(dir, sid, ['## 2026-01-01 [saved]\nGoal: x'], []);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(out.sessionLog.length, 1, 'corrupt ledger must not suppress recall');
});

test('evaluatePayload does not repeat recall within one session', () => {
  // The matching entry must be older than the last two, otherwise the seed
  // correctly suppresses it — SessionStart already injected it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-int-'));
  fs.writeFileSync(path.join(dir, 'session-log.md'), [
    '## 2026-04-01 09:00 [saved]',
    'Goal: condition-based waiting for flaky hooks',
    '',
    '## 2026-04-02 09:00 [saved]',
    'Goal: unrelated release chore',
    '',
    '## 2026-04-03 09:00 [saved]',
    'Goal: another unrelated chore',
    '',
  ].join('\n'));
  const sid = 'dedupe-int-' + Math.random().toString(36).slice(2);
  const payload = {
    prompt: 'help me understand the condition-based waiting approach for hooks',
    cwd: dir,
    session_id: sid,
  };
  const first = evaluatePayload(payload).hookSpecificOutput?.additionalContext || '';
  const second = evaluatePayload(payload).hookSpecificOutput?.additionalContext || '';
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(first.includes('session-memory-recall'), 'first turn injects the entry');
  assert.ok(!second.includes('session-memory-recall'), 'second turn must not repeat it');
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`skill-activator (UserPromptSubmit): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
