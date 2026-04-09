#!/usr/bin/env node
/**
 * Codex UserPromptSubmit adapter.
 *
 * Reuses the shared skill-matching logic while keeping Codex's wire shape,
 * stdin handling, and file pathing isolated from Claude Code.
 */

'use strict';

const { buildContext, isMicroTask, matchSkills } = require('../skill-activator');
const { readJsonStdin } = require('./utils');

function evaluatePayload(data) {
  if (!data || typeof data !== 'object') return {};

  const prompt = typeof data.prompt === 'string' ? data.prompt : '';
  if (!prompt || isMicroTask(prompt)) return {};

  const matches = matchSkills(prompt);
  if (matches.length === 0) return {};

  const context = buildContext(matches);
  if (!context) return {};

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: context,
    },
  };
}

function main() {
  try {
    const data = readJsonStdin();
    process.stdout.write(JSON.stringify(evaluatePayload(data)));
  } catch {
    process.stdout.write('{}');
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { evaluatePayload, main };
}
