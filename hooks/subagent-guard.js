#!/usr/bin/env node
/**
 * Subagent Guard — PreToolUse(Skill) + SubagentStop Hook
 *
 * Keeps subagents from using superpowers-optimized skills, which are written
 * for the main conversation and derail a subagent's narrow task.
 *
 * PreToolUse(Skill): Claude Code passes agent_id only when a hook fires inside
 * a subagent (2.1.100+). A call to one of this plugin's skills there is denied
 * before it runs; the subagent receives the reason as a tool error and carries
 * on with its task. The main session and other plugins' skills are untouched.
 *
 * SubagentStop: the backstop for versions that do not send agent_id. When the
 * subagent's transcript is readable, it decides: block only if one of this
 * plugin's skills actually ran (a denied call's result is an error). Only
 * without a transcript does it fall back to matching the final message's text,
 * which can mistake a mention for an invocation. A block forces a full redo.
 *
 * Prompt-based instructions ("do NOT invoke skills") remain the first layer.
 *
 * Logs violations to: ~/.claude/hooks-logs/subagent-violations.jsonl
 */

const fs = require('fs');
const path = require('path');

// Patterns that indicate a subagent invoked skills or spawned sub-subagents.
// Each pattern requires an action verb (invoke/invoking/using/use/run/running/called/calling)
// immediately before the skill reference so that bare mentions in file content or
// code comments do not trigger false positives.
const SKILL_NAMES = [
  'using-superpowers',
  'brainstorming',
  'deliberation',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'verification-before-completion',
  'token-efficiency',
  'context-management',
  'dispatching-parallel-agents',
  'requesting-code-review',
  'receiving-code-review',
  'finishing-a-development-branch',
  'error-recovery',
  'frontend-design',
  'claude-md-creator',
  'self-consistency-reasoner',
  'using-git-worktrees',
  'premise-check',
  'red-team',
  'refactoring',
  'performance-investigation',
  'dependency-management',
];

const ACTION_VERB = '(?:invoking?|using|use|running?|called?|calling|activat(?:e|ed|ing)|trigger(?:ing|ed)?|execut(?:e|ed|ing)|launch(?:ing|ed)?|spawn(?:ing|ed)?|start(?:ing|ed)?)\\s+(?:the\\s+)?';

const VIOLATION_PATTERNS = [
  /Invoke the superpowers-optimized/i,
  /I'm using the .+ skill/i,
  /Skill\s*\(\s*["']?superpowers/i,
  /skill:\s*["']?(superpowers|using-superpowers|brainstorming|deliberation|systematic-debugging|test-driven-development|verification|executing-plans|writing-plans|context-management|frontend-design|refactoring|performance-investigation|dependency-management)/i,
  ...SKILL_NAMES.map(name => new RegExp(ACTION_VERB + name, 'i')),
];

const PLUGIN_PREFIX = 'superpowers-optimized:';

const DENY_REASON = "Subagents do not use superpowers-optimized skills. Continue your assigned task with your normal tools.";

const BLOCK_REASON = [
  'SKILL LEAKAGE DETECTED: You invoked a superpowers-optimized skill, which is not allowed for subagents.',
  'Redo your assigned task using only your core tools (Read, Edit, Write, Bash, Grep, Glob).',
  'Do NOT invoke the Skill tool. Do NOT reference any superpowers-optimized skills.',
  'Focus only on the task you were given.'
].join(' ');

/** True for one of this plugin's skills, namespaced or by its bare name. */
function isPluginSkill(skill) {
  if (typeof skill !== 'string' || !skill) return false;
  if (skill.startsWith(PLUGIN_PREFIX)) return true;
  return SKILL_NAMES.includes(skill);
}

/**
 * Read a subagent transcript and return the plugin skills that actually ran
 * (a Skill tool_use whose tool_result is not an error). Returns null when the
 * transcript cannot be read, so the caller can fall back to text matching.
 */
function pluginSkillsThatRan(transcriptPath) {
  let content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch (_) {
    return null;
  }

  const calls = new Map(); // tool_use id -> skill name
  const ran = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch (_) { continue; }
    const blocks = row && row.message && Array.isArray(row.message.content) ? row.message.content : [];
    for (const b of blocks) {
      if (b.type === 'tool_use' && b.name === 'Skill' && isPluginSkill(b.input && b.input.skill)) {
        calls.set(b.id, b.input.skill);
      } else if (b.type === 'tool_result' && calls.has(b.tool_use_id) && b.is_error !== true) {
        ran.push(calls.get(b.tool_use_id));
      }
    }
  }
  return ran;
}

function handlePreToolUse(data) {
  const skill = data.tool_input && data.tool_input.skill;
  if (!data.agent_id || data.tool_name !== 'Skill' || !isPluginSkill(skill)) return {};

  logViolation(data.agent_id, data.agent_type || 'unknown', `skill:${skill}`, 'denied');
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: DENY_REASON,
    },
  };
}

function handleSubagentStop(data) {
  const agentId = data.agent_id || 'unknown';
  const agentType = data.agent_type || 'unknown';

  if (data.agent_transcript_path) {
    const ran = pluginSkillsThatRan(data.agent_transcript_path);
    if (ran) {
      // The skill call from before the forced redo stays in the transcript;
      // re-blocking on it would loop the subagent forever.
      if (ran.length === 0 || data.stop_hook_active) return {};
      logViolation(agentId, agentType, `ran:${ran.join(',')}`, 'blocked');
      return { decision: 'block', reason: BLOCK_REASON };
    }
  }

  // No readable transcript: check the final message's wording instead.
  const lastMessage = data.last_assistant_message || '';
  for (const pattern of VIOLATION_PATTERNS) {
    if (pattern.test(lastMessage)) {
      logViolation(agentId, agentType, pattern, 'blocked');
      return { decision: 'block', reason: BLOCK_REASON };
    }
  }
  return {};
}

function logViolation(agentId, agentType, matchedPattern, action) {
  try {
    const logDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'hooks-logs');
    fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(logDir, 'subagent-violations.jsonl');
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      agentId,
      agentType,
      matchedPattern: matchedPattern.toString(),
      action
    }) + '\n';

    fs.appendFileSync(logFile, entry);
  } catch (_) {
    // Logging must never break the hook
  }
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const result = data.hook_event_name === 'PreToolUse'
        ? handlePreToolUse(data)
        : handleSubagentStop(data);
      process.stdout.write(JSON.stringify(result));
    } catch (_) {
      // Parse failure — allow (never break the pipeline)
      process.stdout.write('{}');
    }
  });
}

main();
