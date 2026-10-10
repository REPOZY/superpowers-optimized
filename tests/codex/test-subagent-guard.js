#!/usr/bin/env node
/**
 * Unit tests — hooks/subagent-guard.js
 *
 * Verifies:
 *   - Skill invocation detection (action verbs + skill names)
 *   - Expanded action verb coverage (activate, trigger, execute, launch, spawn, start)
 *   - Skill tool invocation detection
 *   - False positive avoidance (bare mentions without action verbs)
 *   - SKILL_NAMES completeness (includes new skills)
 *   - Output shape: decision=block + reason string
 *
 * Run: node tests/codex/test-subagent-guard.js
 * No dependencies beyond Node.js stdlib.
 *
 * Note: subagent-guard.js uses stdin event-based parsing (not async iterator),
 * so we test by spawning it as a child process with piped stdin.
 */

'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOK_PATH = path.join(__dirname, '..', '..', 'hooks', 'subagent-guard.js');
const source = fs.readFileSync(HOOK_PATH, 'utf8');

// The hook logs violations under HOME. Point it at a throwaway home so running
// the suite never writes test entries into the developer's real violation log.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-home-'));
const HOOK_ENV = { ...process.env, HOME: TEST_HOME, USERPROFILE: TEST_HOME };
const VIOLATION_LOG = path.join(TEST_HOME, '.claude', 'hooks-logs', 'subagent-violations.jsonl');
process.on('exit', () => fs.rmSync(TEST_HOME, { recursive: true, force: true }));

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  \u2713 ${label}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

/**
 * Run subagent-guard.js with a given last_assistant_message.
 * Returns parsed JSON output.
 */
function runGuard(lastMessage) {
  return runHook({
    last_assistant_message: lastMessage,
    agent_id: 'test-agent',
    agent_type: 'test',
  });
}

/** Run subagent-guard.js with an arbitrary hook input object. */
function runHook(data) {
  try {
    const output = execSync(`node "${HOOK_PATH}"`, {
      input: JSON.stringify(data),
      encoding: 'utf8',
      timeout: 5000,
      env: HOOK_ENV,
    });
    return JSON.parse(output.trim());
  } catch (err) {
    // execSync throws on non-zero exit, but the hook should always exit 0
    if (err.stdout) return JSON.parse(err.stdout.trim());
    throw err;
  }
}

/** A PreToolUse(Skill) input; agentId undefined means the main session. */
function skillCall(skill, agentId) {
  const data = { hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill } };
  if (agentId) Object.assign(data, { agent_id: agentId, agent_type: 'general-purpose' });
  return data;
}

/**
 * Write a subagent transcript holding one Skill call and its result, in the
 * shape Claude Code stores (tool_use in an assistant row, tool_result in a
 * user row; a hook-denied call's result has is_error: true).
 */
function writeTranscript(skill, isError) {
  const file = path.join(TEST_HOME, `agent-${Math.random().toString(36).slice(2)}.jsonl`);
  const rows = [
    { type: 'assistant', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill } },
    ] } },
    { type: 'user', message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'toolu_1', is_error: isError, content: isError ? 'PreToolUse:Skill hook error: denied' : 'Launching skill' },
    ] } },
  ];
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  return file;
}

function stopWithTranscript(transcriptPath, lastMessage, extra) {
  return runHook({
    hook_event_name: 'SubagentStop',
    agent_id: 'a1', agent_type: 'general-purpose',
    agent_transcript_path: transcriptPath,
    last_assistant_message: lastMessage,
    ...extra,
  });
}

// ── SKILL_NAMES completeness ─────────────────────────────────────────────────

console.log('\nSKILL_NAMES completeness');

test('Includes original 21 skills', () => {
  const originals = [
    'using-superpowers', 'brainstorming', 'deliberation', 'writing-plans',
    'executing-plans', 'subagent-driven-development', 'systematic-debugging',
    'test-driven-development', 'verification-before-completion', 'token-efficiency',
    'context-management', 'dispatching-parallel-agents', 'requesting-code-review',
    'receiving-code-review', 'finishing-a-development-branch', 'error-recovery',
    'frontend-design', 'claude-md-creator', 'self-consistency-reasoner',
    'using-git-worktrees', 'premise-check',
  ];
  for (const name of originals) {
    assert.ok(source.includes(`'${name}'`), `Missing original skill: ${name}`);
  }
});

test('Includes red-team skill', () => {
  assert.ok(source.includes("'red-team'"), 'Missing red-team skill');
});

test('Includes new refactoring skill', () => {
  assert.ok(source.includes("'refactoring'"), 'Missing refactoring skill');
});

test('Includes new performance-investigation skill', () => {
  assert.ok(source.includes("'performance-investigation'"), 'Missing performance-investigation skill');
});

test('Includes new dependency-management skill', () => {
  assert.ok(source.includes("'dependency-management'"), 'Missing dependency-management skill');
});

// ── Action verb coverage ─────────────────────────────────────────────────────

console.log('\nAction verb coverage');

test('Original verbs: invoking, using, running, calling', () => {
  assert.ok(source.includes('invoking?'), 'Missing invoke/invoking');
  assert.ok(source.includes('using'), 'Missing using');
  assert.ok(source.includes('running?'), 'Missing run/running');
  assert.ok(source.includes('called?'), 'Missing call/called');
  assert.ok(source.includes('calling'), 'Missing calling');
});

test('New verbs: activate, trigger, execute, launch, spawn, start', () => {
  assert.ok(source.includes('activat'), 'Missing activate/activating');
  assert.ok(source.includes('trigger'), 'Missing trigger/triggering');
  assert.ok(source.includes('execut'), 'Missing execute/executing');
  assert.ok(source.includes('launch'), 'Missing launch/launching');
  assert.ok(source.includes('spawn'), 'Missing spawn/spawning');
  assert.ok(source.includes('start'), 'Missing start/starting');
});

// ── Skill tool detection patterns ────────────────────────────────────────────

console.log('\nSkill tool detection');

test('Detects Skill() function call pattern', () => {
  assert.ok(source.includes('Skill\\s*\\(\\s*'), 'Missing Skill() invocation pattern');
});

test('Detects skill: key pattern', () => {
  assert.ok(source.includes('skill:\\s*'), 'Missing skill: key pattern');
});

// ── Violation detection (end-to-end via child process) ───────────────────────

console.log('\nViolation detection (end-to-end)');

test('Blocks "I\'m using the brainstorming skill"', () => {
  const result = runGuard("I'm using the brainstorming skill to help with this.");
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "Invoke the superpowers-optimized skill"', () => {
  const result = runGuard('Invoke the superpowers-optimized using-superpowers skill.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "I activated the systematic-debugging skill"', () => {
  const result = runGuard('I activated the systematic-debugging skill to investigate.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "triggering the test-driven-development skill"', () => {
  const result = runGuard('I am triggering the test-driven-development skill now.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "executing the context-management skill"', () => {
  const result = runGuard('Let me try executing the context-management skill.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "launching the frontend-design skill"', () => {
  const result = runGuard('I am launching the frontend-design skill for this UI work.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "spawning the refactoring skill"', () => {
  const result = runGuard('I will be spawning the refactoring skill to restructure.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "starting the performance-investigation skill"', () => {
  const result = runGuard('Starting the performance-investigation skill to profile.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

test('Blocks "calling the dependency-management skill"', () => {
  const result = runGuard('I am calling the dependency-management skill for updates.');
  assert.strictEqual(result.decision, 'block', `Expected block, got: ${JSON.stringify(result)}`);
});

// ── False positive avoidance ─────────────────────────────────────────────────

console.log('\nFalse positive avoidance');

test('Does NOT block bare skill name mention without action verb', () => {
  const result = runGuard('The brainstorming skill exists in this codebase. I read it.');
  assert.deepStrictEqual(result, {}, `Bare mention should not block: ${JSON.stringify(result)}`);
});

test('Does NOT block file path containing skill name', () => {
  const result = runGuard('I read the file at skills/systematic-debugging/SKILL.md');
  assert.deepStrictEqual(result, {}, `File path should not block: ${JSON.stringify(result)}`);
});

test('Does NOT block normal task completion messages', () => {
  const result = runGuard('I have completed the refactoring task. All tests pass. Here is the summary of changes made.');
  assert.deepStrictEqual(result, {}, `Normal message should not block: ${JSON.stringify(result)}`);
});

test('Does NOT block empty messages', () => {
  const result = runGuard('');
  assert.deepStrictEqual(result, {}, 'Empty message should not block');
});

// ── Output shape ─────────────────────────────────────────────────────────────

console.log('\nOutput shape');

test('Block output has decision and reason fields', () => {
  const result = runGuard("I'm using the brainstorming skill.");
  assert.strictEqual(result.decision, 'block');
  assert.strictEqual(typeof result.reason, 'string');
  assert.ok(result.reason.includes('SKILL LEAKAGE DETECTED'), `Reason should mention leakage: ${result.reason}`);
});

test('Allow output is empty object', () => {
  const result = runGuard('I completed the task using Read and Edit tools.');
  assert.deepStrictEqual(result, {});
});

test('Handles invalid JSON input gracefully', () => {
  try {
    const output = execSync(`echo "not json" | node "${HOOK_PATH}"`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    const result = JSON.parse(output.trim());
    assert.deepStrictEqual(result, {}, 'Invalid JSON should produce {}');
  } catch (err) {
    if (err.stdout) {
      const result = JSON.parse(err.stdout.trim());
      assert.deepStrictEqual(result, {});
    }
  }
});

// ── PreToolUse: deny this plugin's skills inside subagents ───────────────────

console.log('\nPreToolUse(Skill) — block before the call runs');

test('Denies a namespaced plugin skill inside a subagent', () => {
  const result = runHook(skillCall('superpowers-optimized:brainstorming', 'a1'));
  const out = result.hookSpecificOutput || {};
  assert.strictEqual(out.hookEventName, 'PreToolUse');
  assert.strictEqual(out.permissionDecision, 'deny', JSON.stringify(result));
  assert.ok(/continue/i.test(out.permissionDecisionReason || ''), 'reason must tell the subagent to carry on');
});

test('Denies a bare plugin skill name inside a subagent', () => {
  const result = runHook(skillCall('systematic-debugging', 'a1'));
  assert.strictEqual((result.hookSpecificOutput || {}).permissionDecision, 'deny', JSON.stringify(result));
});

test('Allows the same skill in the main session (no agent_id)', () => {
  assert.deepStrictEqual(runHook(skillCall('superpowers-optimized:brainstorming')), {});
});

test("Allows another plugin's or the user's own skill inside a subagent", () => {
  assert.deepStrictEqual(runHook(skillCall('my-plugin:deploy', 'a1')), {});
  assert.deepStrictEqual(runHook(skillCall('deploy-staging', 'a1')), {});
});

test('Allows non-Skill tools inside a subagent', () => {
  assert.deepStrictEqual(runHook({
    hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x' }, agent_id: 'a1',
  }), {});
});

test('Logs a denial to the violation log', () => {
  runHook(skillCall('superpowers-optimized:test-driven-development', 'a-logged'));
  const rows = fs.readFileSync(VIOLATION_LOG, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const row = rows.find(r => r.agentId === 'a-logged');
  assert.ok(row, 'denial must be logged');
  assert.strictEqual(row.action, 'denied');
});

// ── SubagentStop: the transcript decides, not the wording ────────────────────

console.log('\nSubagentStop with transcript — block only a skill that actually ran');

test('Blocks when a plugin skill ran, even if the final message is clean', () => {
  const t = writeTranscript('superpowers-optimized:brainstorming', false);
  assert.strictEqual(stopWithTranscript(t, 'Done. Summary of findings below.').decision, 'block');
});

test('Does NOT block a skill call the PreToolUse hook already denied', () => {
  const t = writeTranscript('superpowers-optimized:brainstorming', true);
  assert.deepStrictEqual(stopWithTranscript(t, "I'm using the brainstorming skill... it was denied, continuing."), {});
});

test('Does NOT block a text-only mention when the transcript shows no skill ran', () => {
  const t = writeTranscript('my-plugin:deploy', false);
  assert.deepStrictEqual(stopWithTranscript(t, 'All green after running the systematic-debugging checks.'), {});
});

test('Does NOT block again on the forced redo (stop_hook_active)', () => {
  const t = writeTranscript('superpowers-optimized:brainstorming', false);
  assert.deepStrictEqual(stopWithTranscript(t, 'Redone without skills.', { stop_hook_active: true }), {});
});

test('Falls back to text patterns when the transcript cannot be read', () => {
  const missing = path.join(TEST_HOME, 'no-such-transcript.jsonl');
  assert.strictEqual(stopWithTranscript(missing, "I'm using the brainstorming skill.").decision, 'block');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`subagent-guard: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
