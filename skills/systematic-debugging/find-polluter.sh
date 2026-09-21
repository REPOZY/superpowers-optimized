#!/usr/bin/env bash
# Bisection script to find which test creates unwanted files/state
# Usage: ./find-polluter.sh <file_or_dir_to_check> <test_pattern>
# Example: ./find-polluter.sh '.git' 'src/**/*.test.ts'
#
# Exit codes:
#   0  no polluter found (every matched test ran, none created the marker)
#   1  polluter found (named in the output)
#   2  the pattern matched no test files — nothing was proven
#   3  the pollution marker already existed before the run

set -uo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <file_to_check> <test_pattern>"
  echo "Example: $0 '.git' 'src/**/*.test.ts'"
  exit 1
fi

POLLUTION_CHECK="$1"
TEST_PATTERN="$2"

echo "🔍 Searching for test that creates: $POLLUTION_CHECK"
echo "Test pattern: $TEST_PATTERN"
echo ""

# `find .` emits ./-prefixed paths, so a -path pattern has to match that form.
# A caller-supplied ./ prefix is stripped first so it is never doubled into a
# never-matching './././…'.
STRIPPED="${TEST_PATTERN#./}"
PATTERN_NESTED="./${STRIPPED}"

# `src/**/*.test.ts` reads as "under src, at any depth", but -path treats the
# pattern literally: it requires a directory segment where `**/` sits, so a
# test directly under src/ is skipped. Matching the collapsed form as well
# covers both depths.
PATTERN_COLLAPSED="./${STRIPPED//\*\*\//}"

# find prints each matching file once even when both alternatives would match,
# so no de-duplication is needed. `sort -z` is used for deterministic ordering
# where available (GNU coreutils, recent BSD); elsewhere find's traversal order
# is kept, which is stable for a given filesystem state.
if printf 'a\0' | sort -z > /dev/null 2>&1; then
  SORT_NUL=(sort -z)
else
  SORT_NUL=(cat)
fi

TEST_FILES=()
while IFS= read -r -d '' file; do
  TEST_FILES+=("$file")
done < <(
  find . -type f \( -path "$PATTERN_NESTED" -o -path "$PATTERN_COLLAPSED" \) -print0 2>/dev/null \
    | "${SORT_NUL[@]}"
)

TOTAL=${#TEST_FILES[@]}

# A pattern that matches nothing proves nothing. Reporting "all tests clean"
# here is the failure this exit code exists to prevent.
if [ "$TOTAL" -eq 0 ]; then
  echo "❌ No test files matched pattern: $TEST_PATTERN"
  echo ""
  echo "   Nothing was run, so nothing was proven — this is not a clean result."
  echo ""
  echo "   Tried:"
  echo "     $PATTERN_NESTED"
  echo "     $PATTERN_COLLAPSED"
  echo ""
  echo "   Check the pattern against what find sees:"
  echo "     find . -type f -name '*.test.*' | head"
  exit 2
fi

# Pre-existing pollution makes every subsequent check meaningless: the marker
# is already there, so no test can be shown to have created it.
if [ -e "$POLLUTION_CHECK" ]; then
  echo "❌ Pollution marker already exists before any test ran: $POLLUTION_CHECK"
  echo ""
  echo "   Remove or reset it first, then re-run — otherwise the bisection"
  echo "   cannot attribute it to any test."
  exit 3
fi

echo "Found $TOTAL test files"
echo ""

COUNT=0
for TEST_FILE in "${TEST_FILES[@]}"; do
  COUNT=$((COUNT + 1))

  echo "[$COUNT/$TOTAL] Testing: $TEST_FILE"

  # Run the test
  npm test "$TEST_FILE" > /dev/null 2>&1 || true

  # Check if pollution appeared
  if [ -e "$POLLUTION_CHECK" ]; then
    echo ""
    echo "🎯 FOUND POLLUTER!"
    echo "   Test: $TEST_FILE"
    echo "   Created: $POLLUTION_CHECK"
    echo ""
    echo "Pollution details:"
    ls -la "$POLLUTION_CHECK"
    echo ""
    echo "To investigate:"
    echo "  npm test $TEST_FILE    # Run just this test"
    echo "  cat $TEST_FILE         # Review test code"
    exit 1
  fi
done

echo ""
echo "✅ No polluter found - all $TOTAL tests ran clean!"
exit 0
