#!/usr/bin/env node
/**
 * Codex PreToolUse Bash Dispatcher
 *
 * Single dispatcher for Codex PreToolUse(Bash) events.
 * Runs safety checks sequentially in one process — critical because
 * Codex fires multiple matching hooks for the same event concurrently,
 * so you cannot rely on ordered execution across separate hook files.
 *
 * Checks applied in order:
 *   1. block-dangerous-commands — catastrophic/high-risk shell commands
 *   2. protect-secrets (Bash path) — secret exposure and exfiltration
 *
 * First block wins. Non-Bash tool calls return {} immediately.
 *
 * Note on Codex limitations:
 *   - updatedInput is parsed but not honored (command rewriting not possible)
 *   - This hook can only block, not modify the command
 *   - Read/Edit/Write interception is not possible on Codex (no tool events for those)
 *
 * Separation rule: this file is Codex-only. The Claude Code PreToolUse
 * hooks (hooks.json) remain unchanged.
 *
 * Input:  stdin JSON with { tool_name, tool_input: { command }, session_id, cwd, ... }
 * Output: stdout JSON — {} to allow, or denial decision to block
 */

'use strict';

const path = require('path');

const SAFETY_DIR = path.join(__dirname, '..', 'safety');

// Import shared policy logic — check functions only, not main() entry points
const { checkCommand } = require(path.join(SAFETY_DIR, 'block-dangerous-commands'));
const { checkBashCommand } = require(path.join(SAFETY_DIR, 'protect-secrets'));

// Codex-specific block output shape (top-level permissionDecision per official docs)
function blockResponse(reason) {
  return JSON.stringify({
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  });
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);

    // Only act on Bash tool calls — Codex only fires PreToolUse for Bash,
    // but be explicit in case that changes. Normalize casing defensively.
    if ((data.tool_name || '').toLowerCase() !== 'bash') {
      process.stdout.write('{}');
      return;
    }

    const cmd = data.tool_input?.command || '';

    // Check 1: dangerous commands (rm -rf ~, fork bombs, curl|sh, etc.)
    const dangerResult = checkCommand(cmd);
    if (dangerResult.blocked) {
      const p = dangerResult.pattern;
      const emoji = { critical: '🚨', high: '⛔', strict: '⚠️' }[p.level] || '⛔';
      process.stdout.write(blockResponse(`${emoji} [${p.id}] ${p.reason}`));
      return;
    }

    // Check 2: secret exposure and exfiltration via Bash
    const secretResult = checkBashCommand(cmd);
    if (secretResult.blocked) {
      const p = secretResult.pattern;
      const emoji = { critical: '🔐', high: '🛡️', strict: '⚠️' }[p.level] || '🛡️';
      process.stdout.write(blockResponse(`${emoji} [${p.id}] ${p.reason}`));
      return;
    }

    process.stdout.write('{}');
  } catch {
    // Never block on hook errors — fail open
    process.stdout.write('{}');
  }
}

main();
