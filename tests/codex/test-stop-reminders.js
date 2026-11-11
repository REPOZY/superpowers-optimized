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

const TEST_SESSION_ID = 'test-session-abc123';

function writeRecentEdit(logDir, filePath) {
  const line = `${new Date().toISOString()} | ${TEST_SESSION_ID} | Edit | ${filePath}\n`;
  fs.writeFileSync(path.join(logDir, 'edit-log.txt'), line, 'utf8');
}

function writeRecentEdits(logDir, filePaths) {
  const now = Date.now();
  const lines = filePaths
    .map((p, i) => `${new Date(now + i).toISOString()} | ${TEST_SESSION_ID} | Edit | ${p}\n`)
    .join('');
  fs.writeFileSync(path.join(logDir, 'edit-log.txt'), lines, 'utf8');
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

    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });

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

    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
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
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    assert.deepStrictEqual(result, {},
      `Expected empty output without reminders, got: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Stats-only session (skill invocations but no edits) emits {} — does not block', () => {
  // Regression test for v6.5.1 bug: stats summary alone must NOT trigger decision:block.
  // The user reported "Stop hook error: <stop-hook-reminders> Session summary: 6min,
  // 1 skill invocations [executing-plans (1x)]" after every stop — caused by the stop
  // hook blocking even when the only reminder was the informational stats summary.
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    // Write a session-stats.json simulating a session with 1 skill call, no edits
    const statsFile = path.join(logDir, 'session-stats.json');
    fs.writeFileSync(statsFile, JSON.stringify({
      startedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min ago
      skillInvocations: { 'superpowers-optimized:executing-plans': 1 },
      totalSkillCalls: 1,
      hookBlocks: 0,
      filesEdited: 0,
      verificationsRun: 0,
    }), 'utf8');
    // No edit-log entries for this session (no edits made)

    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });

    assert.deepStrictEqual(result, {},
      `Stats-only session must emit {}, got: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Commit reminder suppressed when all session edits are committed (git clean)', () => {
  // Regression test for post-v6.5.2 fix: commit reminder must check actual git status,
  // not session edit count. A session that edited 5+ files but committed them all
  // must NOT emit a commit reminder.
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    // Simulate 6 session edits so the edit-count threshold (>=5) is crossed
    const editLog = path.join(logDir, 'edit-log.txt');
    const lines = ['a.js','b.js','c.js','d.js','e.js','f.js'].map(f =>
      `${new Date().toISOString()} | ${TEST_SESSION_ID} | Edit | ${f}\n`
    ).join('');
    fs.writeFileSync(editLog, lines, 'utf8');

    const { evaluatePayload } = loadHookWithHome(homeDir);
    // cwdDir is a temp dir with no git repo → getUncommittedCount returns 0 → no commit reminder
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });

    // May block for TDD reminder (source files, no tests), but must NOT mention "Commit reminder"
    const reason = result.reason || '';
    assert.ok(!reason.includes('Commit reminder'),
      `Commit reminder must not fire when git reports no uncommitted changes, got: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Edits outside the project (scratch files, temp dirs) never trigger reminders', () => {
  // Regression: a throwaway probe.js in the session scratchpad produced "TDD reminder:
  // 1 source file(s) modified" and blocked the stop, though the repo was clean.
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-stop-scratch-'));
  try {
    writeRecentEdits(logDir, [path.join(scratch, 'probe.js'), path.join(scratch, 'a.js'),
      path.join(scratch, 'b.js'), path.join(scratch, 'c.js')]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    assert.deepStrictEqual(result, {},
      `Edits outside cwd must not produce reminders, got: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir, scratch);
  }
});

test('Edits inside the project still trigger the TDD reminder', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, path.join(cwdDir, 'src', 'index.js'));
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    assert.ok((result.reason || '').includes('TDD reminder'),
      `In-project source edit must still trigger TDD reminder, got: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Project scoping is not fooled by a sibling directory sharing the prefix', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  const sibling = cwdDir + '-other';
  try {
    writeRecentEdit(logDir, path.join(sibling, 'index.js'));
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    assert.deepStrictEqual(result, {},
      `"${sibling}" is not inside "${cwdDir}", got: ${JSON.stringify(result)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

// ── isSignificantSession pattern coverage ────────────────────────────────────

console.log('\nisSignificantSession pattern coverage');

test('Detects SKILL.md edits', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'skills/debugging/SKILL.md');
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    const reason = result.reason || '';
    assert.ok(reason.includes('Decision log'), `SKILL.md edit should trigger decision log: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Detects hooks/*.js edits', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'hooks/context-engine.js');
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    const reason = result.reason || '';
    assert.ok(reason.includes('Decision log'), `hooks/*.js edit should trigger decision log: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Detects specs/*.md edits (new pattern)', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'docs/specs/test-spec.md');
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    const reason = result.reason || '';
    assert.ok(reason.includes('Decision log'), `specs/*.md edit should trigger decision log: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Detects plans/*.md edits (new pattern)', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'docs/plans/test-plan.md');
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    const reason = result.reason || '';
    assert.ok(reason.includes('Decision log'), `plans/*.md edit should trigger decision log: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Detects plugin.universal.yaml edits (new pattern)', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'plugin.universal.yaml');
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    const reason = result.reason || '';
    assert.ok(reason.includes('Decision log'), `plugin.universal.yaml edit should trigger decision log: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Does NOT trigger for regular source file edits', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdit(logDir, 'src/app.js');
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const result = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    const reason = result.reason || '';
    assert.ok(!reason.includes('Decision log'), `Regular source file should NOT trigger decision log: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

// ── Project-agnostic significance (D2) ───────────────────────────────────────
// SIGNIFICANT_FILE_PATTERNS only match agent-tooling repos. These tests cover
// the volume rule, which is what makes the reminder fire in ordinary projects.

console.log('\nProject-agnostic decision-log trigger');

test('Fires on a plain app project with enough source files touched', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, [
      'src/auth/session.ts',
      'src/auth/token.ts',
      'src/api/login.ts',
      'src/components/LoginForm.tsx',
    ]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(reason.includes('Decision log'),
      `4 source files in a non-plugin project should trigger the reminder: ${reason}`);
    assert.ok(reason.includes('4 source files'),
      `Reminder should name the real trigger, got: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Does not fire below the source-file threshold', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('Decision log'), `3 source files is a fix, not a design session: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Counts distinct files, not repeated edits to one file', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, [
      'src/a.ts', 'src/a.ts', 'src/a.ts',
      'src/a.ts', 'src/a.ts', 'src/a.ts',
    ]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('Decision log'),
      `Six edits to one file is iteration, not breadth: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Docs-only and config-only sessions do not trigger the volume rule', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, [
      'README.md', 'docs/guide.md', 'package.json',
      'tsconfig.json', '.prettierrc',
    ]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('Decision log'), `Non-source files must not count: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Config-pattern match still wins and names the files', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['CLAUDE.md', 'src/a.ts']);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(reason.includes('Decision log'), `CLAUDE.md should trigger: ${reason}`);
    assert.ok(reason.includes('CLAUDE.md'), `Reminder should name the file, got: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('getSessionSignificance returns null for an empty session', () => {
  const { homeDir, cwdDir } = makeTempDirs();
  try {
    const { getSessionSignificance } = loadHookWithHome(homeDir);
    assert.strictEqual(getSessionSignificance([]), null);
    assert.strictEqual(getSessionSignificance(null), null);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

// ── Volume nudge is one-shot; design signal lowers the bar ────────────────────
// The volume rule is a heuristic, so it must not nag every turn of a long
// feature session. A design/diagnostic skill is direct evidence of decisions,
// so it triggers at a lower file count and keeps reminding until saved.

console.log('\nDecision-log nudge cadence and design signal');

function writeSkillStats(logDir, sessionId, skills) {
  fs.writeFileSync(
    path.join(logDir, `session-stats-${sessionId}.json`),
    JSON.stringify({
      sessionId,
      startedAt: new Date().toISOString(),
      skillInvocations: skills,
      totalSkillCalls: Object.values(skills).reduce((a, b) => a + b, 0),
    }),
    'utf8'
  );
}

test('Volume nudge fires once, then stays quiet for the rest of the session', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['x1.ts', 'x2.ts', 'x3.ts', 'x4.ts']);
    const { evaluatePayload, setGuard } = loadHookWithHome(homeDir);

    const first = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(first.includes('Decision log'), `First stop should nudge: ${first}`);

    // Clear the 2-minute anti-loop guard so only the one-shot marker can suppress.
    fs.rmSync(path.join(logDir, 'stop-hook-fired.lock'), { force: true });
    const second = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!second.includes('Decision log'),
      `Volume nudge must not repeat in the same session: ${second}`);
    void setGuard;
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Config-file nudge fires once per unsaved phase, not at every stop', () => {
  // Each block forces a full extra model turn. Repeating an identical reminder
  // the agent already saw adds no information (33 blocks for 14 user prompts
  // in one real session).
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['skills/x/SKILL.md']);
    const { evaluatePayload } = loadHookWithHome(homeDir);

    const first = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    fs.rmSync(path.join(logDir, 'stop-hook-fired.lock'), { force: true });
    const second = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';

    assert.ok(first.includes('Decision log'), 'first should fire');
    assert.ok(!second.includes('Decision log'), `identical reminder repeated: ${second}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Decision-log nudge returns after a [saved] entry once new work accumulates', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    const t0 = Date.now() - 10 * 60 * 1000;
    const line = (ms, p) => `${new Date(ms).toISOString()} | ${TEST_SESSION_ID} | Edit | ${p}\n`;
    fs.writeFileSync(path.join(logDir, 'edit-log.txt'), line(t0, 'skills/x/SKILL.md'));
    const { evaluatePayload } = loadHookWithHome(homeDir);
    assert.ok((evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '').includes('Decision log'));

    // A [saved] entry is written, then a new phase edits another config file.
    fs.writeFileSync(path.join(logDir, 'last-saved-entry.txt'), new Date(t0 + 60000).toISOString());
    fs.appendFileSync(path.join(logDir, 'edit-log.txt'), line(t0 + 120000, 'skills/y/SKILL.md'));
    fs.rmSync(path.join(logDir, 'stop-hook-fired.lock'), { force: true });
    const next = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(next.includes('Decision log'), `new phase must be able to nudge again: ${next}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Design skill lowers the bar to 2 source files', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['x1.ts', 'x2.ts']);
    writeSkillStats(logDir, TEST_SESSION_ID, { 'systematic-debugging': 2 });
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(reason.includes('Decision log'), `2 files + design skill should fire: ${reason}`);
    assert.ok(reason.includes('systematic-debugging'),
      `Reminder should name the skill that justified it: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Non-design skills do not lower the bar', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['x1.ts', 'x2.ts']);
    writeSkillStats(logDir, TEST_SESSION_ID, { 'token-efficiency': 1 });
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('Decision log'),
      `token-efficiency is not a design signal: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Skill stats from another session are never inherited', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['x1.ts', 'x2.ts']);
    writeSkillStats(logDir, 'a-completely-different-session', { 'brainstorming': 3 });
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('Decision log'),
      `Another session's skill usage must not trigger this session: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Plugin-namespaced skill names are recognised', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['x1.ts', 'x2.ts']);
    writeSkillStats(logDir, TEST_SESSION_ID, { 'superpowers-optimized:brainstorming': 1 });
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(reason.includes('Decision log'),
      `Namespaced skill name should still count as a design signal: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Design bar ignores test files: one code file plus its test does not fire', () => {
  // Regression (6.11.0): brainstorming now runs for small work, and every small
  // TDD feature is one code file plus one test file. Counting the test file made
  // each one cost an extra turn writing a session-log entry for a tiny change.
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['src/validation.js', 'test/validation.test.js']);
    writeSkillStats(logDir, TEST_SESSION_ID, { 'superpowers-optimized:brainstorming': 1 });
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('Decision log'),
      `1 code file + its test is small work, not a design session: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Design bar still fires on 2 code files, and counts only the code files', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeRecentEdits(logDir, ['src/a.js', 'src/b.js', 'test/a.test.js']);
    writeSkillStats(logDir, TEST_SESSION_ID, { 'superpowers-optimized:brainstorming': 1 });
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(reason.includes('Decision log'), `2 code files + design skill should fire: ${reason}`);
    assert.ok(reason.includes('2 source files'), `Count should exclude the test file: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

// ── Subagent edits and reminder repeats ──────────────────────────────────────
// Subagent tool calls fire the parent's PostToolUse hooks with agent_id set, so
// their edits land in the parent session's log. Subagent implementers run TDD
// under their own brief and reviewer; the parent must not be told to do it.

console.log('\nSubagent edits and reminder repeats');

function writeEditRows(logDir, rows) {
  const now = Date.now();
  fs.writeFileSync(path.join(logDir, 'edit-log.txt'), rows.map((r, i) =>
    `${new Date(now + i).toISOString()} | ${TEST_SESSION_ID} | ${r.sub ? 'Edit@subagent' : 'Edit'} | ${r.p}\n`
  ).join(''), 'utf8');
}

function clearGuard(logDir) {
  fs.rmSync(path.join(logDir, 'stop-hook-fired.lock'), { force: true });
}

test('parseLogLine flags subagent edits and keeps the bare tool name', () => {
  const { homeDir } = makeTempDirs();
  try {
    const { parseLogLine } = loadHookWithHome(homeDir);
    const sub = parseLogLine('2026-01-01T00:00:00.000Z | s1 | Write@subagent | /p/a.ts');
    assert.strictEqual(sub.subagent, true);
    assert.strictEqual(sub.tool, 'Write');
    assert.strictEqual(sub.filePath, '/p/a.ts');
    const own = parseLogLine('2026-01-01T00:00:00.000Z | s1 | Edit | /p/a.ts');
    assert.strictEqual(own.subagent, false);
    const legacy = parseLogLine('2026-01-01T00:00:00.000Z | Edit | /p/a.ts');
    assert.strictEqual(legacy.subagent, false);
  } finally {
    cleanup(homeDir);
  }
});

test('track-edits marks subagent edits; main-session edits stay unmarked', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  const trackPath = path.join(__dirname, '../../hooks/track-edits.js');
  const prev = { home: process.env.HOME, up: process.env.USERPROFILE };
  try {
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    delete require.cache[require.resolve(trackPath)];
    const { logEdit } = require(trackPath);
    logEdit('Edit', path.join(cwdDir, 'a.ts'), cwdDir, TEST_SESSION_ID, 'agent-123');
    logEdit('Write', path.join(cwdDir, 'b.ts'), cwdDir, TEST_SESSION_ID);
    const lines = fs.readFileSync(path.join(logDir, 'edit-log.txt'), 'utf8').trim().split('\n');
    assert.ok(/ \| Edit@subagent \| /.test(lines[0]), lines[0]);
    assert.ok(/ \| Write \| /.test(lines[1]), lines[1]);
    assert.strictEqual(lines[0].split(' | ').length, 4, 'log must stay 4-field');
  } finally {
    process.env.HOME = prev.home;
    process.env.USERPROFILE = prev.up;
    cleanup(homeDir, cwdDir);
  }
});

test('Subagent-only source edits trigger no TDD or state.md reminder', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    fs.writeFileSync(path.join(cwdDir, 'state.md'), '# State\n');
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(path.join(cwdDir, 'state.md'), past, past);
    writeEditRows(logDir, [
      { p: path.join(cwdDir, 'src', 'a.rs'), sub: true },
      { p: path.join(cwdDir, 'src', 'b.rs'), sub: true },
    ]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('TDD reminder'), `subagent work triggered TDD: ${reason}`);
    assert.ok(!reason.includes('State.md sync'), `subagent work triggered state sync: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Subagent source edits still count toward the decision log', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeEditRows(logDir, ['a', 'b', 'c', 'd'].map(n => ({ p: path.join(cwdDir, `${n}.ts`), sub: true })));
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(reason.includes('Decision log'), `delegated work is still this session's design work: ${reason}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('A subagent test edit still counts as a test change for main-agent source edits', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    writeEditRows(logDir, [
      { p: path.join(cwdDir, 'src', 'a.ts') },
      { p: path.join(cwdDir, 'src', 'a.test.ts'), sub: true },
    ]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const reason = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!reason.includes('TDD reminder'), reason);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('TDD reminder fires once per untested file, and again only for a new one', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    const a = path.join(cwdDir, 'src', 'a.ts');
    const b = path.join(cwdDir, 'src', 'b.ts');
    writeEditRows(logDir, [{ p: a }]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const first = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(first.includes('TDD reminder'), first);
    assert.ok(first.includes('a.ts'), `reminder should name the file: ${first}`);

    clearGuard(logDir);
    const repeat = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    assert.deepStrictEqual(repeat, {}, `identical TDD reminder repeated: ${JSON.stringify(repeat)}`);

    clearGuard(logDir);
    writeEditRows(logDir, [{ p: a }, { p: b }]);
    const grown = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(grown.includes('TDD reminder') && grown.includes('b.ts'), `new untested file must re-fire: ${grown}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('State.md sync fires once per state.md version', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    const statePath = path.join(cwdDir, 'state.md');
    fs.writeFileSync(statePath, '# State v1\n');
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(statePath, past, past);
    // A test edit keeps the TDD reminder out of the way.
    writeEditRows(logDir, [
      { p: path.join(cwdDir, 'a.ts') }, { p: path.join(cwdDir, 'b.ts') }, { p: path.join(cwdDir, 'a.test.ts') },
    ]);
    const { evaluatePayload } = loadHookWithHome(homeDir);
    assert.ok((evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '').includes('State.md sync'));

    clearGuard(logDir);
    const repeat = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!repeat.includes('State.md sync'), `same state.md version re-nagged: ${repeat}`);

    // state.md rewritten, then more source edits after it.
    fs.writeFileSync(statePath, '# State v2\n');
    const mid = new Date(Date.now() - 30000);
    fs.utimesSync(statePath, mid, mid);
    clearGuard(logDir);
    const again = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(again.includes('State.md sync'), `new state.md version overtaken by edits should fire: ${again}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Session-log size warning fires once per session-log version', () => {
  const { homeDir, cwdDir } = makeTempDirs();
  try {
    fs.writeFileSync(path.join(cwdDir, 'session-log.md'), '## 2026-04-15 [saved]\nGoal: x\n' + 'x'.repeat(1600) + '\n');
    const { evaluatePayload } = loadHookWithHome(homeDir);
    const first = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(first.includes('Session-log size warning'), first);
    fs.rmSync(path.join(homeDir, '.claude', 'hooks-logs', 'stop-hook-fired.lock'), { force: true });
    const repeat = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID });
    assert.deepStrictEqual(repeat, {}, `unchanged session-log re-warned: ${JSON.stringify(repeat)}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

test('Commit reminder repeats only when uncommitted work doubles', () => {
  const { homeDir, cwdDir, logDir } = makeTempDirs();
  try {
    const git = (...a) => require('child_process').spawnSync('git', a, { cwd: cwdDir, encoding: 'utf8' });
    if (git('init', '-q').status !== 0) return; // git unavailable: nothing to assert
    const files = n => Array.from({ length: n }, (_, i) => path.join(cwdDir, `f${i}.md`));
    for (const f of files(6)) fs.writeFileSync(f, 'x');
    writeEditRows(logDir, files(6).map(p => ({ p })));
    const { evaluatePayload } = loadHookWithHome(homeDir);
    assert.ok((evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '').includes('Commit reminder'));

    clearGuard(logDir);
    for (const f of files(8)) fs.writeFileSync(f, 'x');
    const same = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(!same.includes('Commit reminder'), `6→8 uncommitted is the same situation: ${same}`);

    clearGuard(logDir);
    for (const f of files(12)) fs.writeFileSync(f, 'x');
    const doubled = evaluatePayload({ cwd: cwdDir, session_id: TEST_SESSION_ID }).reason || '';
    assert.ok(doubled.includes('Commit reminder'), `12 uncommitted should remind again: ${doubled}`);
  } finally {
    cleanup(homeDir, cwdDir);
  }
});

// ── checkSessionLogSize hard cap ─────────────────────────────────────────────

console.log('\ncheckSessionLogSize hard cap');

test('Entry at 1200 chars does NOT trigger warning (cap is 1500)', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cap-home-'));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cap-'));
  try {
    // ~1200 chars: under old cap (1000) this would trigger, under new cap (1500) it should not
    const content = '## 2026-04-15 [saved]\nGoal: Test\n' + 'Decisions:\n- ' + 'x'.repeat(1100) + '\n';
    fs.writeFileSync(path.join(tmpDir, 'session-log.md'), content);
    const hook = loadHookWithHome(homeDir);
    const result = hook.checkSessionLogSize(tmpDir);
    assert.strictEqual(result, null, `1200-char entry should NOT trigger at 1500 cap, got: ${result}`);
  } finally {
    cleanup(homeDir, tmpDir);
  }
});

test('Entry at 1600 chars DOES trigger warning', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cap-home-'));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cap-'));
  try {
    const content = '## 2026-04-15 [saved]\nGoal: Test\n' + 'x'.repeat(1600) + '\n';
    fs.writeFileSync(path.join(tmpDir, 'session-log.md'), content);
    const hook = loadHookWithHome(homeDir);
    const result = hook.checkSessionLogSize(tmpDir);
    assert.ok(result !== null, 'Expected warning for 1600-char entry');
    assert.ok(result.includes('375 tokens'), `Warning should reference 375 token cap, got: ${result}`);
  } finally {
    cleanup(homeDir, tmpDir);
  }
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`stop-reminders: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
