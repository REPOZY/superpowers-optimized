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
 * - Memory recall: keyword-based grep of session-log.md, ≤2 entries
 * - Session-scoped dedupe: an entry is injected at most once per session,
 *   including entries the SessionStart hook already showed
 * - Context pressure gate: blocks plan execution when the window is too full,
 *   sized against the model's real context window (see resolveContextWindow)
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

// Ranking constants. Flat keyword-density scoring degenerated on normal-length
// prompts: with 38 extracted keywords, a genuinely relevant entry earned 0.023
// from density while the newest entry earned 0.300 from recency alone — recency
// outweighed relevance ~13x, so recall returned "the most recent entries that
// share any word with the prompt". IDF weighting fixes the ranking; the
// relevance floor is what actually stops irrelevant entries being injected.
const MAX_SCORING_KEYWORDS = 12; // Only the most distinctive terms get to vote
const MIN_RELEVANCE = 0.30;      // Share of the corpus's discriminating weight an entry must match
const MIN_COVERAGE = 0.25;       // Share of the prompt's own keywords an entry must match
const RECENCY_WEIGHT = 0.10;     // Recency breaks ties; it must never outrank relevance

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
  // Prompt scaffolding — words that appear in almost every instruction and
  // carry no domain signal. Measured: these inflated keyword counts, which
  // depressed every entry's relevance score and let recency take over.
  'first', 'once', 'done', 'else', 'take', 'takes', 'comes', 'come', 'step',
  'steps', 'start', 'starts', 'within', 'following', 'follow', 'imagine',
  'idea', 'ideas', 'fast', 'forward', 'whether', 'something', 'anything',
  'everything', 'nothing', 'someone', 'maybe', 'sure', 'much', 'many', 'most',
  'less', 'next', 'last', 'keep', 'keeps', 'made', 'give', 'gives', 'given',
  'said', 'says', 'tell', 'find', 'finds', 'able', 'lets', 'going', 'gets',
  'stated', 'thanks', 'thank',
  // NOT stop words, deliberately: "state" (state.md), "plan", "hook", "map",
  // "memory", "context" — these are the domain nouns recall exists to match.
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
 * Rank entries against prompt keywords using IDF-weighted overlap.
 *
 * Each keyword is weighted by how rare it is across the corpus, so a term that
 * appears in every entry contributes almost nothing while a distinctive term
 * dominates. Only the MAX_SCORING_KEYWORDS rarest terms vote — long prompts
 * otherwise dilute every entry's score toward zero. An entry qualifies only if
 * it matches at least MIN_RELEVANCE of the total distinctive weight; recency is
 * a tiebreak, never a substitute for relevance.
 *
 * Returns [{ entry, relevance, score }] sorted best-first.
 */
function rankEntries(entries, keywords) {
  if (!entries || entries.length === 0) return [];
  if (!keywords || keywords.length === 0) return [];

  const lower = entries.map(e => e.toLowerCase());
  const n = entries.length;

  // Smoothed IDF: always positive (no divide-by-zero, no dropped terms), but a
  // term present in every entry scores near zero while a unique term scores high.
  const weighted = keywords.map(kw => {
    const df = lower.reduce((count, text) => count + (text.includes(kw) ? 1 : 0), 0);
    return { kw, df, weight: Math.log((n + 1) / (df + 0.5)) };
  });

  const terms = weighted
    .filter(t => t.df > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_SCORING_KEYWORDS);
  if (terms.length === 0) return [];

  const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight <= 0) return [];

  // Coverage denominator counts the keywords the user actually used, including
  // ones absent from this corpus. Without it, a prompt whose only corpus-present
  // word is "plugin" would score every entry containing "plugin" at 1.0 —
  // relevance alone cannot tell "highly on-topic" from "tiny corpus".
  const coverageDenominator = Math.min(keywords.length, MAX_SCORING_KEYWORDS);

  const scored = [];
  for (let i = 0; i < entries.length; i++) {
    const text = lower[i];
    const matchedTerms = terms.filter(t => text.includes(t.kw));
    if (matchedTerms.length === 0) continue;

    const matchedWeight = matchedTerms.reduce((sum, t) => sum + t.weight, 0);
    const relevance = matchedWeight / totalWeight;
    const coverage = matchedTerms.length / coverageDenominator;
    if (relevance < MIN_RELEVANCE || coverage < MIN_COVERAGE) continue;

    const recency = (i + 1) / n;
    scored.push({
      entry: entries[i],
      relevance,
      coverage,
      score: relevance * (1 - RECENCY_WEIGHT) + recency * RECENCY_WEIGHT,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/** Trim an entry to the injection budget. */
function trimEntry(entry) {
  return entry.length > MAX_ENTRY_CHARS
    ? entry.slice(0, MAX_ENTRY_CHARS).trimEnd() + '\n*(entry truncated)*'
    : entry;
}

/**
 * Search session-log.md for [saved] entries matching the given keywords.
 * Skips [superseded] entries. Returns up to MAX_MEMORY_ENTRIES matches,
 * ranked by IDF-weighted relevance with recency as a tiebreak.
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

  return rankEntries(entries, keywords)
    .slice(0, MAX_MEMORY_ENTRIES)
    .map(s => trimEntry(s.entry));
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

  return rankEntries(entries, keywords)
    .slice(0, MAX_MEMORY_ENTRIES)
    .map(s => trimEntry(s.entry));
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

// ── Session-scoped recall dedupe ──────────────────────────────────────────────
//
// Recall runs on EVERY non-micro prompt. Without dedupe, the same session-log
// and known-issues entries re-inject on every turn whose keywords repeat, and
// they duplicate what the SessionStart hook already injected on turn 1 — up to
// ~1.5K tokens of pure repetition per turn on a long session.
//
// A per-session ledger records which entries have already been surfaced and
// suppresses repeats, so each entry costs its tokens once per session.

const RECALL_LEDGER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_START_SAVED_ENTRIES = 2; // must match hooks/session-start awk block
const SESSION_START_KNOWN_ISSUES = 5;  // must match hooks/session-start node block

function hooksLogDir() {
  return path.join(
    process.env.USERPROFILE || process.env.HOME || '.',
    '.claude',
    'hooks-logs'
  );
}

function recallLedgerPath(sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  return path.join(hooksLogDir(), `recall-${safe}.json`);
}

/** An entry's first line — the "## <date> [saved]" header — identifies it. */
function entryKey(entry) {
  if (!entry || typeof entry !== 'string') return '';
  return entry.split('\n')[0].trim();
}

/**
 * Headers the SessionStart hook already injected, so recall never repeats them.
 * Mirrors hooks/session-start: last 2 [saved] entries, last 5 open known issues.
 */
function sessionStartSeed(cwd) {
  const seed = { sessionLog: [], knownIssues: [] };
  try {
    const log = fs.readFileSync(path.join(cwd, 'session-log.md'), 'utf8');
    seed.sessionLog = log.split('\n')
      // Must match hooks/session-start exactly: superseded entries are not injected,
      // so seeding on them would leave a genuinely injected entry un-deduped.
      .filter(l => /^## .+\[saved\]/.test(l) && !/\[superseded/.test(l))
      .map(l => l.trim())
      .slice(-SESSION_START_SAVED_ENTRIES);
  } catch {
    // File absent — nothing was injected, nothing to seed
  }
  try {
    const issues = fs.readFileSync(path.join(cwd, 'known-issues.md'), 'utf8');
    seed.knownIssues = issues.split('\n')
      .filter(l => l.startsWith('## ') && !l.startsWith('## ~~'))
      .map(l => l.trim())
      .slice(-SESSION_START_KNOWN_ISSUES);
  } catch {
    // File absent
  }
  return seed;
}

function loadRecallLedger(cwd, sessionId) {
  try {
    const raw = JSON.parse(fs.readFileSync(recallLedgerPath(sessionId), 'utf8'));
    if (raw && typeof raw === 'object') {
      return {
        sessionLog: Array.isArray(raw.sessionLog) ? raw.sessionLog : [],
        knownIssues: Array.isArray(raw.knownIssues) ? raw.knownIssues : [],
      };
    }
  } catch {
    // Missing or corrupt — start from what SessionStart already showed
  }
  return sessionStartSeed(cwd);
}

function pruneRecallLedgers(dir) {
  try {
    const cutoff = Date.now() - RECALL_LEDGER_TTL_MS;
    for (const name of fs.readdirSync(dir)) {
      if (!/^recall-.*\.json$/.test(name)) continue;
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch {
        // Skip files we cannot stat or remove
      }
    }
  } catch {
    // Directory unreadable — nothing to prune
  }
}

function saveRecallLedger(sessionId, ledger) {
  try {
    const dir = hooksLogDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(recallLedgerPath(sessionId), JSON.stringify(ledger));
    pruneRecallLedgers(dir);
  } catch {
    // Never block the prompt on ledger write failures
  }
}

/**
 * Drop entries already surfaced this session and record the survivors.
 * Without a session id no ledger is possible, so nothing is filtered.
 */
function dedupeRecall(cwd, sessionId, sessionLogEntries, knownIssueEntries) {
  const logIn = sessionLogEntries || [];
  const issuesIn = knownIssueEntries || [];
  if (!sessionId) return { sessionLog: logIn, knownIssues: issuesIn };

  const ledger = loadRecallLedger(cwd, sessionId);
  const seenLog = new Set(ledger.sessionLog);
  const seenIssues = new Set(ledger.knownIssues);

  const freshLog = logIn.filter(e => !seenLog.has(entryKey(e)));
  const freshIssues = issuesIn.filter(e => !seenIssues.has(entryKey(e)));

  if (freshLog.length === 0 && freshIssues.length === 0) {
    return { sessionLog: [], knownIssues: [] };
  }

  saveRecallLedger(sessionId, {
    sessionLog: [...seenLog, ...freshLog.map(entryKey)],
    knownIssues: [...seenIssues, ...freshIssues.map(entryKey)],
  });

  return { sessionLog: freshLog, knownIssues: freshIssues };
}

// ── Context pressure gate ─────────────────────────────────────────────────────

/**
 * Patterns that indicate the user is about to start plan execution
 * or heavy implementation work.
 */
const EXECUTION_TRIGGER_PATTERNS = [
  /\bexecute\s+(the\s+)?plan\b/i,
  /\bstart\s+build(ing)?\b/i,
  /\bstart\s+implement(ing|ation)?\b/i,
  /\bfollow\s+(the\s+)?plan\b/i,
  /\bimplement\s+(the\s+)?plan\b/i,
  /\blet'?s\s+(build|implement|execute)\b/i,
  /\brun\s+(the\s+)?plan\b/i,
  /\bbegin\s+implement(ing|ation)?\b/i,
  /\bbegin\s+(the\s+)?plan\b/i,
];

// Conservative default window. Do NOT raise this — most models still ship a
// 200K window, and assuming a larger one silently disables the gate for them.
const CONTEXT_WINDOW_SIZE = 200000;
const DEFAULT_CONTEXT_WINDOW = CONTEXT_WINDOW_SIZE;
const LARGE_CONTEXT_WINDOW = 1000000; // 1M-token tier
const CONTEXT_PRESSURE_THRESHOLD = 0.60; // Hard block at 60% by default

/**
 * Returns true if the prompt is triggering plan execution or heavy implementation.
 */
function isExecutionTrigger(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  return EXECUTION_TRIGGER_PATTERNS.some(p => p.test(prompt));
}

/**
 * Parse a window setting into a token count.
 * Accepts "1000000", "1m", "1M", "200k", "1_000_000".
 * Returns null when missing or unparseable.
 */
function parseWindowSetting(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toLowerCase().replace(/[_,\s]/g, '');
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return null;
  const mult = m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1;
  const tokens = Math.round(n * mult);
  // Reject nonsense values ("5", "0.2") — a real window is at least 1K tokens
  return tokens >= 1000 ? tokens : null;
}

/**
 * Parse a threshold setting. Accepts "0.6", ".75", "60", "60%".
 * Returns null when missing or out of the exclusive (0,1) range.
 */
function parseThresholdSetting(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().replace('%', '');
  if (!s) return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  const ratio = n > 1 ? n / 100 : n;
  return ratio > 0 && ratio < 1 ? ratio : null;
}

function getPressureThreshold(env) {
  const e = env || process.env;
  const configured = parseThresholdSetting(e.SP_CONTEXT_PRESSURE_THRESHOLD);
  return configured === null ? CONTEXT_PRESSURE_THRESHOLD : configured;
}

/**
 * Resolve the effective context window in tokens.
 *
 * Priority:
 *   1. SP_CONTEXT_WINDOW env var — explicit, always wins ("1m", "200k", raw count)
 *   2. a [1m] marker in the model id recorded in the session transcript
 *   3. auto-escalation — a turn has already exceeded the default window, so the
 *      default is provably wrong; step up to the smallest tier that fits
 *   4. DEFAULT_CONTEXT_WINDOW
 *
 * Auto-escalation only rescues the gate after 200K has been crossed, by which
 * point it has already misfired once. Users on a larger window should set
 * SP_CONTEXT_WINDOW so the gate is correct from turn one.
 */
function resolveContextWindow(observed, env) {
  const e = env || process.env;
  const o = observed || {};

  const configured = parseWindowSetting(e.SP_CONTEXT_WINDOW);
  if (configured) return configured;

  if (o.model && /\[1m\]/i.test(o.model)) return LARGE_CONTEXT_WINDOW;

  if (o.observedMax && o.observedMax > DEFAULT_CONTEXT_WINDOW) {
    return o.observedMax > LARGE_CONTEXT_WINDOW
      ? Math.ceil(o.observedMax / 100000) * 100000
      : LARGE_CONTEXT_WINDOW;
  }

  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Convert a filesystem cwd path to the Claude Code project directory name.
 * Examples:
 *   Windows: "C:\Users\Tjerk Pieksma\..." → "c--Users-Tjerk-Pieksma-..."
 *   Unix:    "/home/user/projects/foo"    → "home-user-projects-foo"
 */
function cwdToProjectDir(cwd) {
  return cwd
    .replace(/^([A-Za-z]):/, (_, d) => d.toLowerCase() + '-') // C: → c-
    .replace(/[/\\]/g, '-')  // path separators → -
    .replace(/\s/g, '-')     // spaces → -
    .replace(/-+$/, '');     // trim trailing dashes
}

/**
 * Read the current session JSONL and return context pressure info.
 * Uses the last assistant turn's total input tokens as the context size estimate —
 * this is the most accurate indicator of how much context window is currently occupied.
 * Returns null if the JSONL can't be read or has no usable data.
 */
function getContextPressure(cwd, sessionId, env) {
  if (!sessionId) return null;

  const projectDir = cwdToProjectDir(cwd);
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const jsonlPath = path.join(homeDir, '.claude', 'projects', projectDir, sessionId + '.jsonl');

  let content;
  try {
    content = fs.readFileSync(jsonlPath, 'utf8');
  } catch {
    return null; // File absent or unreadable — silent no-op
  }

  // Use the last assistant turn's input total as context size.
  // input + cache_creation + cache_read = total tokens in context window for that turn.
  // Later turns always have more context, so the last value is the current state.
  // observedMax and model feed window resolution (see resolveContextWindow).
  let lastInputTotal = 0;
  let observedMax = 0;
  let model = '';

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'assistant' && obj.message && obj.message.usage) {
        const u = obj.message.usage;
        const turnInput = (u.input_tokens || 0)
          + (u.cache_creation_input_tokens || 0)
          + (u.cache_read_input_tokens || 0);
        if (turnInput > 0) {
          lastInputTotal = turnInput;
          if (turnInput > observedMax) observedMax = turnInput;
        }
        if (typeof obj.message.model === 'string' && obj.message.model) {
          model = obj.message.model;
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (lastInputTotal === 0) return null;

  const window = resolveContextWindow({ model, observedMax }, env);
  const threshold = getPressureThreshold(env);
  const ratio = lastInputTotal / window;
  return {
    inputK: Math.round(lastInputTotal / 1000),
    percent: Math.round(ratio * 100),
    windowK: Math.round(window / 1000),
    window,
    threshold,
    overThreshold: ratio >= threshold,
  };
}

/**
 * Format a token count as a human-readable window label ("200K", "1M", "1.5M").
 */
function formatWindowLabel(windowTokens) {
  if (!windowTokens || windowTokens < 1000) return `${windowTokens || 0}`;
  if (windowTokens >= 1000000) {
    const m = windowTokens / 1000000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(windowTokens / 1000)}K`;
}

/**
 * Build the hard block message injected when context pressure crosses the
 * threshold. Returned as additionalContext — Claude sees this instead of skill
 * hints. Window and threshold default to the conservative values so callers
 * that pass only { inputK, percent } still render a sensible message.
 */
function buildContextPressureBlock(pressure) {
  const windowTokens = pressure.window
    || (pressure.windowK ? pressure.windowK * 1000 : DEFAULT_CONTEXT_WINDOW);
  const windowLabel = formatWindowLabel(windowTokens);
  const thresholdPct = Math.round(
    (pressure.threshold || CONTEXT_PRESSURE_THRESHOLD) * 100
  );

  return [
    '<context-pressure-gate>',
    `STOP — Do not start implementation yet.`,
    ``,
    `Context window: ~${pressure.inputK}K tokens consumed (${pressure.percent}% of ${windowLabel} limit).`,
    `Starting implementation at ≥${thresholdPct}% risks Auto Compact firing mid-task, destroying`,
    `variable names, file paths, and discovered facts at the worst possible moment.`,
    ``,
    `Required actions before proceeding:`,
    `1. Invoke the context-management skill to write state.md. Include:`,
    `   - Path to the plan file`,
    `   - Starting task number (e.g. "Task 1 — fresh start")`,
    `   - Any research-phase facts (exact file paths, variable names, non-obvious`,
    `     constraints) that the plan references but does not spell out explicitly.`,
    `2. Tell the user: "Context is at ${pressure.percent}%. Saving state and compacting`,
    `   before implementation — this prevents Auto Compact firing mid-task."`,
    `3. Run /compact.`,
    `4. After compaction, read state.md and resume with executing-plans.`,
    ``,
    `Do NOT begin implementation without completing steps 1–3.`,
    `</context-pressure-gate>`,
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
    const sessionId = data.session_id || null;

    // Micro-task fast path: skip all enrichment entirely
    if (isMicroTask(prompt)) {
      process.stdout.write('{}');
      return;
    }

    // Context pressure gate: if the user is about to start implementation and
    // the context window is ≥60% full, block and require compact-first.
    // Returns early — pressure block replaces all other hints when it fires.
    if (isExecutionTrigger(prompt)) {
      const pressure = getContextPressure(cwd, sessionId);
      if (pressure && pressure.overThreshold) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: buildContextPressureBlock(pressure),
          },
        }));
        return;
      }
    }

    // Run all pipelines independently
    const matches = matchSkills(prompt);
    const keywords = extractKeywords(prompt);
    const memoryEntries = searchSessionLog(cwd, keywords);
    const knownIssueEntries = searchKnownIssues(cwd, keywords);

    // Suppress entries already surfaced earlier in this session
    const fresh = dedupeRecall(cwd, sessionId, memoryEntries, knownIssueEntries);

    const skillContext = buildContext(matches);
    const memoryContext = buildMemoryContext(fresh.sessionLog);
    const knownIssuesContext = buildKnownIssuesContext(fresh.knownIssues);

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
    rankEntries,
    trimEntry,
    MAX_SCORING_KEYWORDS,
    MIN_RELEVANCE,
    MIN_COVERAGE,
    isExecutionTrigger,
    cwdToProjectDir,
    getContextPressure,
    buildContextPressureBlock,
    parseWindowSetting,
    parseThresholdSetting,
    resolveContextWindow,
    getPressureThreshold,
    formatWindowLabel,
    dedupeRecall,
    entryKey,
    sessionStartSeed,
    loadRecallLedger,
    saveRecallLedger,
    recallLedgerPath,
    RULES,
    CONFIDENCE_THRESHOLD,
    STOP_WORDS,
    MAX_MEMORY_ENTRIES,
    CONTEXT_WINDOW_SIZE,
    DEFAULT_CONTEXT_WINDOW,
    LARGE_CONTEXT_WINDOW,
    CONTEXT_PRESSURE_THRESHOLD,
  };
}
