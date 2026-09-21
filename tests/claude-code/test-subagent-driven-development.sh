#!/usr/bin/env bash
# Test: subagent-driven-development skill
# Verifies that the skill is loaded and follows correct workflow
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

# Path to skill file (relative to this script's directory)
SKILL_FILE="../../skills/subagent-driven-development/SKILL.md"

echo "=== Test: subagent-driven-development skill ==="
echo ""

# Test 1: Verify skill can be loaded
echo "Test 1: Skill loading..."

output=$(run_claude "Read the file at $SKILL_FILE and tell me: what is the subagent-driven-development skill? Describe its key steps briefly." 60 "Read")

if assert_contains "$output" "subagent-driven-development\|Subagent-Driven Development\|Subagent Driven" "Skill is recognized"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "Load Plan\|read.*plan\|extract.*tasks" "Mentions loading plan"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 2: Verify the task review returns both verdicts from one reviewer
echo "Test 2: Task review structure..."

output=$(run_claude "Read the file at $SKILL_FILE. Answer: how many reviewers are dispatched per task, and which verdicts must that review return?" 60 "Read")

if assert_contains "$output" "[Oo]ne\|ONE\|single" "One reviewer per task"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "spec\|compliance" "Spec verdict required"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "quality" "Quality verdict required"; then
    : # pass
else
    exit 1
fi

output=$(run_claude "Read the file at $SKILL_FILE. Answer: is a review report that contains only one of the two verdicts acceptable?" 60 "Read")

if assert_contains "$output" "[Nn]o\|not acceptable\|incomplete\|both.*required\|send it back" "Single-verdict report is rejected"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 3: Verify self-review is mentioned
echo "Test 3: Self-review requirement..."

output=$(run_claude "Read the file at $SKILL_FILE and answer: does the subagent-driven-development skill require implementers to do self-review? What should they check?" 60 "Read")

if assert_contains "$output" "self-review\|self review" "Mentions self-review"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "verification\|evidence\|tests\|fix\|report" "Requires verification evidence"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 4: Verify plan is read once
echo "Test 4: Plan reading efficiency..."

output=$(run_claude "Read the file at $SKILL_FILE and answer: how many times should the controller read the plan file? When does this happen?" 60 "Read")

if assert_contains "$output" "once\|one time\|single" "Read plan once"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "Step 1\|beginning\|start\|Load Plan" "Read at beginning"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 5: Verify the task reviewer is skeptical and read-only
echo "Test 5: Task reviewer mindset..."

REVIEWER_FILE="../../skills/subagent-driven-development/task-reviewer-prompt.md"

output=$(run_claude "Read the file at $REVIEWER_FILE and answer: what is the reviewer's attitude toward the implementer's report and rationale?" 60 "Read")

if assert_contains "$output" "not trust\|don't trust\|skeptical\|rationale is not a fix\|not.*soften\|independently" "Reviewer does not defer to the implementer's rationale"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "read.*code\|read.*file\|Read tool\|inspect.*code\|verify.*code" "Reviewer reads the code before forming findings"; then
    : # pass
else
    exit 1
fi

output=$(run_claude "Read the file at $REVIEWER_FILE and answer: may the reviewer modify the working tree, run git checkout, or dispatch its own subagent?" 60 "Read")

if assert_contains "$output" "[Nn]o\|read-only\|not.*modify\|never.*checkout\|must not\|do not" "Reviewer is read-only and may not spawn subagents"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 6: Verify review loops
echo "Test 6: Review loop requirements..."

output=$(run_claude "Read the file at $SKILL_FILE and answer: what happens if a reviewer finds issues? Is it a one-time review or a loop?" 60 "Read")

if assert_contains "$output" "loop\|again\|repeat\|until.*approved\|until.*compliant" "Review loops mentioned"; then
    : # pass
else
    exit 1
fi

output=$(run_claude "Read the file at $SKILL_FILE and answer: when a reviewer finds issues, who makes the fixes — the controller session itself, or the implementer subagent? Is the loop bounded?" 60 "Read")

if assert_contains "$output" "implementer" "Implementer makes the fixes"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "not.*controller\|never.*controller\|controller.*never\|controller.*not\|don't fix\|do not fix\|skips review\|not yourself" "Controller does not fix findings itself"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "five\|5 round\|cap\|circuit breaker\|bounded\|maximum" "Fix loop is bounded"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 7: Verify task context is handed over as a brief file, not pasted
echo "Test 7: Task context provision..."

output=$(run_claude "Read the file at $SKILL_FILE and answer: how does the controller give the implementer subagent its task requirements? Does the implementer read the full plan file?" 60 "Read")

if assert_contains "$output" "brief" "Hands over a brief"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "path\|file" "Passes a path rather than pasted text"; then
    : # pass
else
    exit 1
fi

if assert_contains "$output" "never.*whole plan\|not.*whole plan\|never.*full plan\|not.*full plan\|don't read\|do not read\|never read\|no[,.]" "Implementer does not read the whole plan file"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 8: Verify worktree requirement
echo "Test 8: Worktree requirement..."

output=$(run_claude "Read the file at $SKILL_FILE and answer: what workflow skills are required before using subagent-driven-development? List any prerequisites." 60 "Read")

if assert_contains "$output" "using-git-worktrees\|worktree" "Mentions worktree requirement"; then
    : # pass
else
    exit 1
fi

echo ""

# Test 9: Verify main branch warning
echo "Test 9: Main branch red flag..."

output=$(run_claude "Read the file at $SKILL_FILE and answer: is it okay to start implementation directly on the main branch in subagent-driven-development?" 60 "Read")

if assert_contains "$output" "worktree\|feature.*branch\|not.*main\|never.*main\|avoid.*main\|don't.*main\|consent\|permission" "Warns against main branch"; then
    : # pass
else
    exit 1
fi

echo ""

echo "=== All subagent-driven-development skill tests passed ==="
