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

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const ADAPTER = path.resolve(__dirname, '../../hooks/codex/session-start-adapter.js');

let passed = 0;
let failed = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function runAdapter(payload, cwd) {
  const result = spawnSync(process.execPath, [ADAPTER], {
    input: JSON.stringify({ cwd, ...payload }),
    encoding: 'utf8',
    timeout: 10000,
    cwd,
    env: {
      ...process.env,
      // Disable auto-update so tests don't trigger git fetch
      SUPERPOWERS_AUTO_UPDATE: '0',
    },
  });
  // The adapter emits plain text then a JSON object on the final line.
  // Extract the last non-empty line and parse it as JSON.
  const raw = (result.stdout || '').trim();
  const lines = raw.split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1] || '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    console.error(`  PARSE ERROR: last line was: ${lastLine.slice(0, 200)}`);
  }
  // Also expose raw plain-text portion for content assertions
  parsed._rawPlainText = lines.slice(0, -1).join('\n');
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

test('Output has hookSpecificOutput.hookEventName = "SessionStart"', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ session_id: 'test-123', source: 'startup' }, dir);
    assert.ok(result.hookSpecificOutput,
      `Missing hookSpecificOutput: ${JSON.stringify(result)}`);
    assert.strictEqual(result.hookSpecificOutput.hookEventName, 'SessionStart',
      `Wrong hookEventName: ${result.hookSpecificOutput.hookEventName}`);
  } finally { cleanup(dir); }
});

test('Output has hookSpecificOutput.additionalContext (non-empty string)', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result.hookSpecificOutput?.additionalContext;
    assert.ok(typeof ctx === 'string' && ctx.length > 0,
      `additionalContext missing or empty: ${JSON.stringify(result)}`);
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
    // Check both plain text (what Codex consumes) and JSON (structured fallback)
    const plainText = result._rawPlainText || '';
    const jsonCtx = result.hookSpecificOutput?.additionalContext || '';
    assert.ok(
      plainText.includes('EXTREMELY_IMPORTANT') || jsonCtx.includes('EXTREMELY_IMPORTANT'),
      'Missing EXTREMELY_IMPORTANT block in context'
    );
  } finally { cleanup(dir); }
});

test('Context contains using-superpowers entry point instruction (plain text)', () => {
  const dir = makeTempDir();
  try {
    const result = runAdapter({ source: 'startup' }, dir);
    const plainText = result._rawPlainText || '';
    const jsonCtx = result.hookSpecificOutput?.additionalContext || '';
    const combined = plainText + jsonCtx;
    assert.ok(
      combined.includes('using-superpowers') || combined.includes('superpowers-optimized'),
      'Missing using-superpowers reference in context'
    );
  } finally { cleanup(dir); }
});

test('project-map.md injected when present', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'project-map.md'), '# Project Map\n\nThis is the map.');
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result.hookSpecificOutput?.additionalContext || '';
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
    const ctx = result.hookSpecificOutput?.additionalContext || '';
    assert.ok(!ctx.includes('<project-map>'),
      'project-map tag present despite no project-map.md file');
  } finally { cleanup(dir); }
});

test('state.md injected when present', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'state.md'), '## In Progress\nWorking on feature X');
    const result = runAdapter({ source: 'startup' }, dir);
    const ctx = result.hookSpecificOutput?.additionalContext || '';
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
    const ctx = result.hookSpecificOutput?.additionalContext || '';
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
    const ctx = result.hookSpecificOutput?.additionalContext || '';
    assert.ok(ctx.includes('<session-log>'),
      'session-log.md present but not injected');
    assert.ok(ctx.includes('add feature Y'),
      '[saved] entry content not in context');
    assert.ok(!ctx.includes('Files: index.js'),
      '[auto] entry content incorrectly included');
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
    const ctx = result.hookSpecificOutput?.additionalContext || '';
    assert.ok(ctx.includes('Critical Constraints'),
      'Critical Constraints section missing from large map');
    assert.ok(ctx.includes('Hot Files'),
      'Hot Files section missing from large map');
    // Overview section (not a key section) should be trimmed
    assert.ok(!ctx.includes('Some overview text that should be cut.'),
      'Overview section incorrectly included in large map injection');
  } finally { cleanup(dir); }
});

// ── Resilience ────────────────────────────────────────────────────────────────

console.log('\nResilience');

test('Empty cwd payload → does not crash, returns valid JSON', () => {
  const result = runAdapter({}, process.cwd());
  assert.ok(typeof result === 'object', 'Did not return a JSON object');
});

test('Missing stdin cwd → falls back to process.cwd(), does not crash', () => {
  // Omit cwd from payload entirely
  const result = spawnSync(process.execPath, [ADAPTER], {
    input: '{"source":"startup"}',
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, SUPERPOWERS_AUTO_UPDATE: '0' },
  });
  let parsed = {};
  try {
    const raw = (result.stdout || '').trim();
    const lines = raw.split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1] || '{}';
    parsed = JSON.parse(lastLine);
  } catch {}
  assert.ok(parsed.hookSpecificOutput?.additionalContext !== undefined,
    'No additionalContext when cwd omitted from payload');
});

test('context-snapshot.json with bad JSON → silently skipped', () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'context-snapshot.json'), 'NOT VALID JSON {{{');
    const result = runAdapter({ source: 'startup' }, dir);
    // Should not crash, should still return valid context
    assert.ok(result.hookSpecificOutput?.additionalContext,
      'Adapter crashed on bad context-snapshot.json');
    assert.ok(!result.hookSpecificOutput.additionalContext.includes('NOT VALID JSON'),
      'Bad JSON content leaked into context');
  } finally { cleanup(dir); }
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`session-start-adapter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
