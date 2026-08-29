#!/usr/bin/env node
/**
 * PostToolUse Hook — Session Statistics Tracker
 *
 * Tracks skill invocations and tool usage during a session to provide
 * visibility into how the plugin is helping. Logs to a session stats file
 * that can be read by the stop-reminders hook or on user request.
 *
 * Triggered on: Skill tool use (PostToolUse matcher: Skill)
 *
 * Input:  stdin JSON with { tool_name, tool_input, session_id, cwd, ... }
 * Output: stdout JSON (always {}, never blocks)
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude',
  'hooks-logs'
);

// Legacy shared file. Kept only so an in-flight session upgrading mid-run still
// shows a summary; all new writes go to a per-session file.
const STATS_FILE = path.join(LOG_DIR, 'session-stats.json');

const STATS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Per-session stats path. The shared file was contaminated across sessions:
 * working in project A then project B within the 2-hour expiry attributed A's
 * skill invocations to B. Same class of bug as the edit-log fix in v6.5.2.
 */
function statsPath(sessionId) {
  if (!sessionId) return STATS_FILE;
  const safe = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  return path.join(LOG_DIR, `session-stats-${safe}.json`);
}

/**
 * Load stats for this session, or initialize empty.
 */
function loadStats(sessionId) {
  const file = statsPath(sessionId);
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      // A different session id in the same file means the shared legacy file —
      // never inherit another session's counts.
      if (sessionId && raw.sessionId && raw.sessionId !== sessionId) {
        return createFreshStats(sessionId);
      }
      return raw;
    }
  } catch {
    // Corrupted file — start fresh
  }
  return createFreshStats(sessionId);
}

function createFreshStats(sessionId) {
  return {
    sessionId: sessionId || null,
    startedAt: new Date().toISOString(),
    skillInvocations: {},
    totalSkillCalls: 0,
    hookBlocks: 0,
    filesEdited: 0,
    verificationsRun: 0,
  };
}

function pruneOldStats() {
  try {
    const cutoff = Date.now() - STATS_TTL_MS;
    for (const name of fs.readdirSync(LOG_DIR)) {
      if (!/^session-stats-.*\.json$/.test(name)) continue;
      const full = path.join(LOG_DIR, name);
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

function saveStats(stats, sessionId) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(statsPath(sessionId), JSON.stringify(stats, null, 2));
    pruneOldStats();
  } catch {
    // Silently ignore
  }
}

/**
 * Format stats into a human-readable summary.
 */
function formatSummary(stats) {
  const duration = Math.round((Date.now() - new Date(stats.startedAt).getTime()) / 60000);
  const lines = [
    `Session duration: ${duration} minutes`,
    `Skills invoked: ${stats.totalSkillCalls}`,
  ];

  const sorted = Object.entries(stats.skillInvocations)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length > 0) {
    lines.push('Skill breakdown:');
    for (const [skill, count] of sorted) {
      lines.push(`  ${skill}: ${count}x`);
    }
  }

  if (stats.hookBlocks > 0) {
    lines.push(`Dangerous operations blocked: ${stats.hookBlocks}`);
  }

  if (stats.filesEdited > 0) {
    lines.push(`Files edited: ${stats.filesEdited}`);
  }

  if (stats.verificationsRun > 0) {
    lines.push(`Verifications run: ${stats.verificationsRun}`);
  }

  return lines.join('\n');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    const { tool_name, tool_input, session_id } = data;

    if (tool_name !== 'Skill') {
      process.stdout.write('{}');
      return;
    }

    const skillName = tool_input?.skill || 'unknown';
    const stats = loadStats(session_id);

    // Track skill invocation
    stats.skillInvocations[skillName] = (stats.skillInvocations[skillName] || 0) + 1;
    stats.totalSkillCalls += 1;

    saveStats(stats, session_id);
  } catch {
    // Silently ignore
  }

  process.stdout.write('{}');
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    loadStats, saveStats, formatSummary, createFreshStats,
    statsPath, pruneOldStats, STATS_FILE,
  };
}
