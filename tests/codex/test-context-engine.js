#!/usr/bin/env node
/**
 * Unit tests — hooks/context-engine.js
 *
 * Verifies:
 *   - Per-project watermark: different cwds produce different filenames
 *   - getLastHeadFile returns a path containing a hash of cwd
 *   - Module loads without error
 *
 * Run: node tests/codex/test-context-engine.js
 * No dependencies beyond Node.js stdlib.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { createHash } = require('crypto');

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

// ── Load module ──────────────────────────────────────────────────────────────

// context-engine.js runs main() on require — it expects stdin JSON.
// We can't require() it directly without piping stdin.
// Instead, test the key logic by reading the source and verifying structural properties.

const SOURCE_PATH = path.join(__dirname, '..', '..', 'hooks', 'context-engine.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

console.log('\nModule structure');

test('context-engine.js exists and is readable', () => {
  assert.ok(source.length > 0, 'File is empty');
});

test('Uses createHash for per-project watermark', () => {
  assert.ok(source.includes('createHash'), 'Missing createHash import');
  assert.ok(source.includes("createHash('md5')"), 'Missing md5 hash of cwd');
});

test('getLastHeadFile function exists', () => {
  assert.ok(source.includes('function getLastHeadFile(cwd)'), 'Missing getLastHeadFile function');
});

test('No longer uses global LAST_HEAD_FILE constant', () => {
  // Should not have `const LAST_HEAD_FILE = path.join(` anymore
  assert.ok(!source.includes('const LAST_HEAD_FILE'), 'Still using global LAST_HEAD_FILE constant');
});

test('Uses getLastHeadFile(cwd) for watermark read', () => {
  assert.ok(source.includes('getLastHeadFile(cwd)'), 'Not calling getLastHeadFile with cwd');
});

// ── Per-project watermark logic ──────────────────────────────────────────────

console.log('\nPer-project watermark');

test('Different cwds produce different watermark filenames', () => {
  const hash1 = createHash('md5').update('/project/alpha').digest('hex').slice(0, 12);
  const hash2 = createHash('md5').update('/project/beta').digest('hex').slice(0, 12);
  assert.notStrictEqual(hash1, hash2, 'Two different paths produced the same hash');
});

test('Same cwd always produces same watermark filename', () => {
  const hash1 = createHash('md5').update('/project/alpha').digest('hex').slice(0, 12);
  const hash2 = createHash('md5').update('/project/alpha').digest('hex').slice(0, 12);
  assert.strictEqual(hash1, hash2, 'Same path produced different hashes');
});

test('Hash is 12 characters (truncated md5)', () => {
  const hash = createHash('md5').update('/any/path').digest('hex').slice(0, 12);
  assert.strictEqual(hash.length, 12, `Expected 12-char hash, got ${hash.length}`);
});

test('Watermark filename includes hash suffix', () => {
  // Verify the pattern: last-session-head-<hash>.txt
  assert.ok(source.includes('`last-session-head-${hash}.txt`'),
    'Watermark filename does not use hash suffix pattern');
});

// ── Cross-session watermark as diff base ─────────────────────────────────────

console.log('\nCross-session diff base');

test('Uses watermark as diff base when available', () => {
  assert.ok(source.includes('useWatermark'), 'Missing useWatermark variable');
  assert.ok(source.includes('diffBase'), 'Missing diffBase variable');
});

test('Falls back to HEAD~1 when no watermark', () => {
  assert.ok(source.includes("'HEAD~1'"), 'Missing HEAD~1 fallback');
});

test('changedFiles uses diffBase, not hardcoded HEAD~1', () => {
  // The changedRaw line should use ${diffBase}, not HEAD~1 directly
  const changedRawLine = source.match(/const changedRaw = run\(`git diff --name-only \$\{diffBase\}\.\.HEAD`/);
  assert.ok(changedRawLine, 'changedRaw does not use diffBase variable');
});

// ── Blast radius filtering contract ──────────────────────────────────────────
// The old regex/fail-open filter was replaced by path resolution. Fail-open was
// itself the defect: an unresolvable reference was kept as a dependent, which is
// how prose mentions became "callers". These tests pin the new contract; the
// behavioural cases live in the referenceResolves block below.

console.log('\nBlast radius filtering contract');

test('Edges are path-resolved, not regex-matched', () => {
  assert.ok(source.includes('referenceResolves'), 'Missing path-resolution filter');
  assert.ok(!source.includes('importPatterns'),
    'Old regex filter must be gone — it matched prose, not references');
});

test('No fail-open: an unresolvable reference is dropped, not kept', () => {
  assert.ok(!source.includes('if (!content) return true'),
    'Fail-open kept unresolvable references and fabricated dependents');
});

test('Snapshot declares how the edges were derived', () => {
  assert.ok(source.includes('blast_radius_method'),
    'Consumers need to know the provenance of these edges');
});

// ── BASENAME_DENYLIST ────────────────────────────────────────────────────────

console.log('\nBasename denylist');

test('BASENAME_DENYLIST blocks common generic names', () => {
  assert.ok(source.includes("'index'"), 'Missing index in denylist');
  assert.ok(source.includes("'config'"), 'Missing config in denylist');
  assert.ok(source.includes("'utils'"), 'Missing utils in denylist');
});

// ── Blast radius resolution ──────────────────────────────────────────────────
// Every edge must resolve to the changed file's real path. The previous
// implementation kept any file containing the basename as a word, inventing
// 21 "dependents" for skills/brainstorming/SKILL.md and 16 for plugin.json —
// and requesting-code-review feeds this list into the reviewer's scope.

const {
  normalizeTarget,
  referenceResolves,
  extractPathTokens,
  BASENAME_DENYLIST,
} = require('../../hooks/context-engine.js');

console.log('\nBlast radius — normalizeTarget');

test('Strips a known extension', () => {
  assert.strictEqual(normalizeTarget('hooks/skill-activator.js'), 'hooks/skill-activator');
  assert.strictEqual(normalizeTarget('src/a/b.tsx'), 'src/a/b');
});
test('Strips a trailing /index', () => {
  assert.strictEqual(normalizeTarget('src/thing/index.ts'), 'src/thing');
});
test('Normalises separators and leading ./', () => {
  assert.strictEqual(normalizeTarget('.\\src\\a.js'), 'src/a');
});

console.log('\nBlast radius — extractPathTokens');

test('Finds path-like tokens containing the basename', () => {
  const t = extractPathTokens("const x = require('../skill-activator');", 'skill-activator');
  assert.ok(t.some(tok => tok.includes('../skill-activator')), `got ${JSON.stringify(t)}`);
});
test('Ignores tokens that do not contain the basename', () => {
  const t = extractPathTokens("import fs from 'fs';", 'skill-activator');
  assert.deepStrictEqual(t, []);
});

console.log('\nBlast radius — referenceResolves');

test('Relative require that resolves to the changed file is an edge', () => {
  assert.strictEqual(
    referenceResolves(
      "const { matchSkills } = require('../skill-activator');",
      'hooks/codex/user-prompt-submit-adapter.js',
      'hooks/skill-activator.js',
      'skill-activator'
    ),
    true
  );
});

test('Relative import resolving somewhere else is NOT an edge', () => {
  assert.strictEqual(
    referenceResolves(
      "import { load } from './session';",
      'src/other/login.ts',
      'src/api/session.ts',
      'session'
    ),
    false,
    'src/other/session is a different file from src/api/session'
  );
});

test('Repo-relative path reference in prose is an edge', () => {
  assert.strictEqual(
    referenceResolves(
      '- hooks/skill-activator.js — UserPromptSubmit hook that injects hints',
      'README.md',
      'hooks/skill-activator.js',
      'skill-activator'
    ),
    true
  );
});

test('Bare word mention is NOT an edge — this was the original bug', () => {
  assert.strictEqual(
    referenceResolves(
      'The skill activator decides routing, and skill-activator is fast.',
      'README.md',
      'hooks/skill-activator.js',
      'skill-activator'
    ),
    false
  );
});

test('Bare filename without a path is NOT an edge', () => {
  assert.strictEqual(
    referenceResolves(
      'Every skill lives in a SKILL.md file.',
      'docs/architecture/project-memory.md',
      'skills/brainstorming/SKILL.md',
      'SKILL'
    ),
    false,
    'SKILL.md alone cannot identify which SKILL.md is meant'
  );
});

test('Prose using the word "plugin" is NOT an edge', () => {
  assert.strictEqual(
    referenceResolves(
      'This is a Claude Code plugin, and the plugin loads skills.',
      'docs/architecture/testing-structure.md',
      '.claude-plugin/plugin.json',
      'plugin'
    ),
    false
  );
});

test('Extensionless relative specifier resolves', () => {
  assert.strictEqual(
    referenceResolves(
      "export * from './helpers/format'",
      'src/index.ts',
      'src/helpers/format.ts',
      'format'
    ),
    true
  );
});

console.log('\nBlast radius — denylist');

test('Basenames that caused the worst false positives are denylisted', () => {
  for (const name of ['skill', 'plugin', 'version', 'readme']) {
    assert.ok(BASENAME_DENYLIST.has(name), `"${name}" must be denylisted`);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`context-engine: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
