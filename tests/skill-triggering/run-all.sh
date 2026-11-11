#!/bin/bash
# Run all skill triggering tests
# Usage: ./run-all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPTS_DIR="$SCRIPT_DIR/prompts"

SKILLS=(
    "systematic-debugging"
    "test-driven-development"
    "writing-plans"
    # dispatching-parallel-agents removed: on any fixture small enough to run
    # cheaply, the model rightly fixes 4 one-line bugs inline (0/6 runs at both
    # v6.8.1 and v6.9.0) — the test could only pass by rewarding waste.
    "executing-plans"
    "requesting-code-review"
)

echo "=== Running Skill Triggering Tests ==="
echo ""

PASSED=0
FAILED=0
ERRORED=0
RESULTS=()

for skill in "${SKILLS[@]}"; do
    prompt_file="$PROMPTS_DIR/${skill}.txt"

    if [ ! -f "$prompt_file" ]; then
        echo "⚠️  SKIP: No prompt file for $skill"
        continue
    fi

    echo "Testing: $skill"

    # The pipeline's own status is tee's (always 0), which once counted every
    # skill as passed. Read run-test.sh's status: 0 pass, 2 API error, else fail.
    set +e
    "$SCRIPT_DIR/run-test.sh" "$skill" "$prompt_file" 6 2>&1 | tee /tmp/skill-test-$skill.log
    rc=${PIPESTATUS[0]}
    set -e
    case $rc in
        0) PASSED=$((PASSED + 1));   RESULTS+=("✅ $skill") ;;
        2) ERRORED=$((ERRORED + 1)); RESULTS+=("⚠️  $skill (API error, no result)") ;;
        *) FAILED=$((FAILED + 1));   RESULTS+=("❌ $skill") ;;
    esac

    echo ""
    echo "---"
    echo ""
done

echo ""
echo "=== Summary ==="
for result in "${RESULTS[@]}"; do
    echo "  $result"
done
echo ""
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "API errors (no result): $ERRORED"

if [ $FAILED -gt 0 ] || [ $ERRORED -gt 0 ]; then
    exit 1
fi
