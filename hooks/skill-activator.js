#!/usr/bin/env node
/**
 * UserPromptSubmit Hook — Proactive Skill Activation + Memory Recall
 *
 * Analyzes the user's prompt before Claude processes it and injects
 * two types of context:
 *
 * 1. Skill hints — which superpowers-optimized skills are relevant to
 *    this prompt (reinforces using-superpowers routing deterministically).
 *
 * 2. Memory recall — relevant past decisions from session-log.md that
 *    match keywords extracted from the prompt. Surfaces historical context
 *    automatically at the moment it's needed, without requiring the AI to
 *    remember to grep the log manually.
 *
 * Features:
 * - Micro-task detection: short, specific prompts skip both features entirely
 * - Confidence threshold: only suggests skills when match confidence is meaningful
 * - Memory recall: keyword-based grep of session-log.md, ≤2 entries, deduped
 * - Smart routing: fewer false positives, zero overhead for simple tasks
 *
 * Input:  stdin JSON with { prompt, session_id, cwd, ... }
 * Output: stdout JSON with additionalContext suggesting relevant skills
 *         and/or surfacing relevant past decisions
 */

const fs = require('fs');
const path = require('path');

// Resolve hooks directory from this script's location
const HOOKS_DIR = __dirname;

// Load skill rules
let RULES = [];
try {
  const rulesPath = path.join(HOOKS_DIR, 'skill-rules.json');
  RULES = JSON.parse(fs.readFileSync(rulesPath, 'utf8')).rules || [];
} catch (e) {
  // If rules can't be loaded, hook is a no-op
  process.stdout.write('{}');
  process.exit(0);
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// Minimum score threshold — matches below this are discarded as noise
const CONFIDENCE_THRESHOLD = 2;

// ── Memory recall constants ───────────────────────────────────────────────────
const MAX_MEMORY_ENTRIES = 2;    // Never inject more than 2 matched entries
const MIN_KEYWORD_LENGTH = 4;   // Skip tokens shorter than this
const MAX_ENTRY_CHARS = 1500;   // Truncate oversized entries (~250 words / ~375 tokens)

// Common English words that produce noisy false-positive matches
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'this', 'that',
  'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'all', 'both', 'each', 'every', 'any', 'some', 'not', 'only',
  'than', 'too', 'very', 'just', 'now', 'also', 'but', 'and', 'or',
  'if', 'then', 'so', 'let', 'get', 'got', 'go', 'make', 'know',
  'think', 'see', 'look', 'use', 'using', 'used', 'like', 'want',
  'need', 'please', 'here', 'there', 'about', 'more', 'other', 'new',
  'good', 'right', 'well', 'really', 'actually', 'already', 'still',
  'even', 'back', 'thing', 'things', 'way', 'work', 'works', 'worked',
]);

/**
 * Detect micro-tasks that should skip skill routing entirely.
 * Returns true if the prompt is clearly a small, specific action.
 */
function isMicroTask(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;

  const lower = prompt.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Very short prompts with specific action words are likely micro-tasks
  if (wordCount <= 8) {
    const microPatterns = [
      /^(fix|change|rename|update|replace|set|remove|delete|add)\s+(the\s+)?(typo|name|variable|import|spacing|indent)/i,
      /^rename\s+\S+\s+to\s+\S+$/i,
      /^(change|update|set)\s+.+\s+(to|=)\s+.+$/i,
      /^remove\s+(the\s+)?(unused|extra|duplicate)\s+/i,
      /^add\s+(a\s+)?(missing\s+)?(import|comma|semicolon|bracket|paren)/i,
      /^fix\s+(the\s+)?(typo|spelling|whitespace|indent(ation)?)/i,
    ];

    if (microPatterns.some(p => p.test(lower))) {
      return true;
    }
  }

  // Single-line file reference with small action
  if (wordCount <= 12 && /line\s+\d+/i.test(lower) && /(fix|change|update|rename|remove)/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Score a prompt against skill rules.
 * Returns matched rules sorted by priority, max 3.
 * Applies confidence threshold to filter weak matches.
 */
function matchSkills(prompt) {
  if (!prompt || typeof prompt !== 'string') return [];

  const lower = prompt.toLowerCase();
  const matches = [];

  for (const rule of RULES) {
    let score = 0;

    // Check keywords (case-insensitive, left-boundary aware)
    for (const kw of rule.keywords || []) {
      const kwLower = kw.toLowerCase();
      // Multi-word keywords: use substring match (boundary is implicit)
      // Single-word keywords: use left word boundary to avoid partial matches
      // (e.g. "fix" in "prefix") while still allowing inflected forms (e.g. "errors" for "error")
      if (kwLower.includes(' ')) {
        if (lower.includes(kwLower)) score += 1;
      } else {
        const re = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        if (re.test(lower)) score += 1;
      }
    }

    // Check intent patterns (regex)
    for (const pattern of rule.intentPatterns || []) {
      try {
        const re = new RegExp(pattern, 'i');
        if (re.test(prompt)) {
          score += 2; // Intent patterns weighted higher
        }
      } catch {
        // Skip invalid regex
      }
    }

    // Apply confidence threshold — single keyword matches are noise
    if (score >= CONFIDENCE_THRESHOLD) {
      matches.push({
        skill: rule.skill,
        priority: rule.priority,
        type: rule.type,
        score,
      });
    }
  }

  // Sort by priority (critical first), then by score (highest first)
  matches.sort((a, b) => {
    const pDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return b.score - a.score;
  });

  return matches.slice(0, 3);
}

/**
 * Build the context injection message for matched skills.
 */
function buildContext(matches) {
  if (matches.length === 0) return null;

  const skillList = matches
    .map(m => `  - superpowers-optimized:${m.skill} (${m.priority})`)
    .join('\n');

  return [
    '<user-prompt-submit-hook>',
    'Skill activation hint: The following skills are relevant to this prompt.',
    'Remember: invoke superpowers-optimized:using-superpowers FIRST as the mandatory entry point,',
    'then follow its routing to these suggested skills:',
    skillList,
    'IMPORTANT: If the user names a skill directly (e.g. "use brainstorming"), invoke it via the Skill tool.',
    'Do NOT re-implement the skill\'s purpose with ad-hoc agents or manual steps.',
    '</user-prompt-submit-hook>',
  ].join('\n');
}

// ── Memory recall ─────────────────────────────────────────────────────────────

/**
 * Extract distinctive keywords from a prompt for session-log searching.
 * Strips stop words, punctuation (preserving hyphens), and short tokens.
 * Returns a deduplicated array of lowercase keyword strings.
 */
function extractKeywords(prompt) {
  if (!prompt || typeof prompt !== 'string') return [];

  const tokens = prompt
    .toLowerCase()
    // Remove punctuation except hyphens (preserves compound terms like "session-log")
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(t));

  return [...new Set(tokens)];
}

/**
 * Search session-log.md for [saved] entries matching the given keywords.
 * Skips [superseded] entries. Returns up to MAX_MEMORY_ENTRIES matches,
 * most recent first. Each entry is trimmed to MAX_ENTRY_CHARS.
 *
 * A match requires at least 1 keyword hit in the entry text.
 * (Threshold is low because keywords are already filtered for distinctiveness.)
 */
function searchSessionLog(cwd, keywords) {
  if (!keywords || keywords.length === 0) return [];

  const logPath = path.join(cwd, 'session-log.md');
  let content;
  try {
    content = fs.readFileSync(logPath, 'utf8');
  } catch {
    return []; // File absent — silent no-op
  }

  // Parse file into individual [saved] entries (preserve order: oldest first)
  const entries = [];
  let current = null;

  for (const line of content.split('\n')) {
    if (/^## .+\[saved\]/.test(line)) {
      // Flush previous entry
      if (current !== null) entries.push(current.trim());
      // Skip superseded entries — they represent overturned decisions
      if (/\[superseded/.test(line)) {
        current = null;
      } else {
        current = line;
      }
    } else if (current !== null) {
      current += '\n' + line;
    }
  }
  // Flush last entry
  if (current !== null) entries.push(current.trim());

  if (entries.length === 0) return [];

  // Weighted scoring: keyword density (70%) + recency (30%)
  // Replaces flat boolean matching to reduce false positives and surface
  // the most relevant entries, not just the most recent ones.
  const scored = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryLower = entry.toLowerCase();
    const hits = keywords.filter(kw => entryLower.includes(kw)).length;
    if (hits === 0) continue;

    const densityScore = hits / keywords.length;
    const recencyScore = (i + 1) / entries.length;
    const score = (densityScore * 0.7) + (recencyScore * 0.3);
    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_MEMORY_ENTRIES).map(s => {
    return s.entry.length > MAX_ENTRY_CHARS
      ? s.entry.slice(0, MAX_ENTRY_CHARS).trimEnd() + '\n*(entry truncated)*'
      : s.entry;
  });
}

/**
 * Format matched session-log entries for injection as additional context.
 */
function buildMemoryContext(entries) {
  if (!entries || entries.length === 0) return null;

  return [
    '<session-memory-recall>',
    'Relevant past decisions matching this prompt (from session-log.md):',
    '',
    entries.join('\n\n'),
    '',
    '*(Full history searchable in session-log.md)*',
    '</session-memory-recall>',
  ].join('\n');
}

// ── Known-issues recall ───────────────────────────────────────────────────────

/**
 * Search known-issues.md for open (non-fixed) entries matching the given keywords.
 * Fixed entries (## ~~...~~) are skipped. Returns up to MAX_MEMORY_ENTRIES matches,
 * most recent first. Each entry is trimmed to MAX_ENTRY_CHARS.
 */
function searchKnownIssues(cwd, keywords) {
  if (!keywords || keywords.length === 0) return [];

  const filePath = path.join(cwd, 'known-issues.md');
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return []; // File absent — silent no-op
  }

  // Parse into open entries (skip fixed entries with ## ~~ header)
  const entries = [];
  let current = null;

  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      if (current !== null) entries.push(current.trim());
      // Fixed entries have strikethrough: ## ~~...~~
      current = line.startsWith('## ~~') ? null : line;
    } else if (current !== null) {
      current += '\n' + line;
    }
  }
  if (current !== null) entries.push(current.trim());

  if (entries.length === 0) return [];

  // Weighted scoring: keyword density (70%) + recency (30%)
  const scored = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryLower = entry.toLowerCase();
    const hits = keywords.filter(kw => entryLower.includes(kw)).length;
    if (hits === 0) continue;

    const densityScore = hits / keywords.length;
    const recencyScore = (i + 1) / entries.length;
    const score = (densityScore * 0.7) + (recencyScore * 0.3);
    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_MEMORY_ENTRIES).map(s => {
    return s.entry.length > MAX_ENTRY_CHARS
      ? s.entry.slice(0, MAX_ENTRY_CHARS).trimEnd() + '\n*(entry truncated)*'
      : s.entry;
  });
}

/**
 * Format matched known-issues entries for injection as additional context.
 */
function buildKnownIssuesContext(entries) {
  if (!entries || entries.length === 0) return null;

  return [
    '<known-issues-recall>',
    'Relevant known issues matching this prompt (from known-issues.md):',
    '',
    entries.join('\n\n'),
    '',
    '*(Full list in known-issues.md)*',
    '</known-issues-recall>',
  ].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    const prompt = data.prompt || '';
    const cwd = data.cwd || process.cwd();

    // Micro-task fast path: skip all enrichment entirely
    if (isMicroTask(prompt)) {
      process.stdout.write('{}');
      return;
    }

    // Run all pipelines independently
    const matches = matchSkills(prompt);
    const keywords = extractKeywords(prompt);
    const memoryEntries = searchSessionLog(cwd, keywords);
    const knownIssueEntries = searchKnownIssues(cwd, keywords);

    const skillContext = buildContext(matches);
    const memoryContext = buildMemoryContext(memoryEntries);
    const knownIssuesContext = buildKnownIssuesContext(knownIssueEntries);

    // Nothing to inject
    if (!skillContext && !memoryContext && !knownIssuesContext) {
      process.stdout.write('{}');
      return;
    }

    // Combine: skill hint first (routing), known issues second (avoid known errors),
    // memory last (historical context)
    const combined = [skillContext, knownIssuesContext, memoryContext].filter(Boolean).join('\n\n');

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: combined,
      },
    }));
  } catch {
    process.stdout.write('{}');
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    matchSkills,
    buildContext,
    isMicroTask,
    extractKeywords,
    searchSessionLog,
    buildMemoryContext,
    searchKnownIssues,
    buildKnownIssuesContext,
    RULES,
    CONFIDENCE_THRESHOLD,
    STOP_WORDS,
    MAX_MEMORY_ENTRIES,
  };
}
