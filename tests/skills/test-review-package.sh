#!/usr/bin/env bash
# Deterministic tests for skills/subagent-driven-development/scripts/review-package
#
# The point of this script is NOT token saving — the reviewer runs git itself
# either way. It exists to make two silent-wrong-answer cases loud:
#
#   1. An empty BASE..HEAD range produces a confident "no issues found" review
#      of nothing, and the task gets marked reviewed.
#   2. A BASE that is not an ancestor of HEAD (implementer committed to the
#      wrong branch) produces a diff that describes work nobody did.
#
# Both must refuse to write a package at all.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REVIEW_PACKAGE="${REPO_ROOT}/skills/subagent-driven-development/scripts/review-package"

PASS=0
FAIL=0

pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1"; echo "    $2"; FAIL=$((FAIL + 1)); }

assert_contains() {
    local hay="$1" needle="$2" name="$3"
    if printf '%s' "$hay" | grep -qF "$needle"; then pass "$name"
    else fail "$name" "expected: $needle"; printf '%s\n' "$hay" | sed 's/^/      /' | head -20; fi
}
assert_not_contains() {
    local hay="$1" needle="$2" name="$3"
    if printf '%s' "$hay" | grep -qF "$needle"; then fail "$name" "did NOT expect: $needle"
    else pass "$name"; fi
}
assert_exit_code() {
    local actual="$1" expected="$2" name="$3"
    if [ "$actual" -eq "$expected" ]; then pass "$name"
    else fail "$name" "expected exit $expected, got $actual"; fi
}

# A git repo with: base commit, then two commits on a feature branch, plus a
# divergent branch that shares only the root commit.
make_repo() {
    git init -q .
    git config user.email "test@example.com"
    git config user.name "Test"
    git config commit.gpgsign false

    mkdir -p docs/plans
    printf '# Plan\n\n### Task 1: Thing\n\nBody\n' > docs/plans/p.md

    printf 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\n' > src.txt
    git add -A && git commit -qm "root commit"
    ROOT_SHA=$(git rev-parse HEAD)

    git checkout -q -b feature
    printf 'CHANGED_BY_FIRST\n' >> src.txt
    git add -A && git commit -qm "first feature commit"
    FIRST_SHA=$(git rev-parse HEAD)

    printf 'CHANGED_BY_SECOND\n' >> src.txt
    echo "new file body" > added.txt
    git add -A && git commit -qm "second feature commit"
    HEAD_SHA=$(git rev-parse HEAD)

    git checkout -q "$ROOT_SHA" 2>/dev/null
    git checkout -q -b divergent
    echo "divergent work" > other.txt
    git add -A && git commit -qm "divergent commit"
    DIVERGENT_SHA=$(git rev-parse HEAD)

    git checkout -q feature
}

echo "review-package"
echo

# ---------------------------------------------------------------------------
echo "Valid range"

T1=$(mktemp -d); cd "$T1"; make_repo
OUT=$(bash "$REVIEW_PACKAGE" docs/plans/p.md "$ROOT_SHA" "$HEAD_SHA" 2>&1); CODE=$?
PKG=$(cat "$OUT" 2>/dev/null || echo "")

assert_exit_code "$CODE" 0 "exits 0 on a valid, non-empty range"
if [ -f "$OUT" ]; then pass "prints a path that exists"; else fail "prints a path that exists" "got: $OUT"; fi
assert_contains "$PKG" "first feature commit" "package lists the first commit in the range"
assert_contains "$PKG" "second feature commit" "package lists the second commit in the range"
assert_not_contains "$PKG" "divergent commit" "package excludes commits outside the range"
assert_contains "$PKG" "CHANGED_BY_FIRST" "package contains the full diff, not just the stat"
assert_contains "$PKG" "added.txt" "package shows newly added files"
assert_contains "$PKG" "src.txt" "package stat names the modified file"
assert_contains "$PKG" "Diff size:" "package reports its own diff size"
assert_not_contains "$PKG" "This diff is large" "no large-diff warning on a small diff"
cd / && rm -rf "$T1"

# ---------------------------------------------------------------------------
echo
echo "Multi-commit ranges are not truncated"

T2=$(mktemp -d); cd "$T2"; make_repo
OUT2=$(bash "$REVIEW_PACKAGE" docs/plans/p.md "$ROOT_SHA" "$HEAD_SHA" 2>&1)
PKG2=$(cat "$OUT2" 2>/dev/null || echo "")
# HEAD~1..HEAD would show only the second commit; the whole range must show both.
assert_contains "$PKG2" "CHANGED_BY_FIRST" "an early commit's changes survive in a multi-commit range"
cd / && rm -rf "$T2"

# ---------------------------------------------------------------------------
echo
echo "Empty range refuses"

T3=$(mktemp -d); cd "$T3"; make_repo
OUT3=$(bash "$REVIEW_PACKAGE" docs/plans/p.md "$HEAD_SHA" "$HEAD_SHA" 2>&1); CODE3=$?

assert_exit_code "$CODE3" 3 "exits 3 when BASE equals HEAD"
assert_contains "$OUT3" "empty" "explains the range is empty"
assert_not_contains "$OUT3" "no issues" "never emits anything resembling a clean verdict"
cd / && rm -rf "$T3"

# ---------------------------------------------------------------------------
echo
echo "Non-descendant range refuses"

T4=$(mktemp -d); cd "$T4"; make_repo
OUT4=$(bash "$REVIEW_PACKAGE" docs/plans/p.md "$DIVERGENT_SHA" "$HEAD_SHA" 2>&1); CODE4=$?

assert_exit_code "$CODE4" 3 "exits 3 when BASE is not an ancestor of HEAD"
assert_contains "$OUT4" "not an ancestor" "explains the branch-point problem"
cd / && rm -rf "$T4"

# ---------------------------------------------------------------------------
echo
echo "Bad input is loud"

T5=$(mktemp -d); cd "$T5"; make_repo

OUT5=$(bash "$REVIEW_PACKAGE" docs/plans/p.md "deadbeefdeadbeef" "$HEAD_SHA" 2>&1); CODE5=$?
assert_exit_code "$CODE5" 2 "exits 2 on an unresolvable BASE ref"

OUT6=$(bash "$REVIEW_PACKAGE" docs/plans/missing.md "$ROOT_SHA" "$HEAD_SHA" 2>&1); CODE6=$?
assert_exit_code "$CODE6" 1 "exits 1 when the plan file does not exist"

OUT7=$(bash "$REVIEW_PACKAGE" docs/plans/p.md "$ROOT_SHA" 2>&1); CODE7=$?
assert_exit_code "$CODE7" 1 "exits 1 on wrong argument count"
cd / && rm -rf "$T5"

# ---------------------------------------------------------------------------
echo
echo "Package shares the plan's workspace"

T6=$(mktemp -d); cd "$T6"; make_repo
BRIEF=$(bash "${REPO_ROOT}/skills/subagent-driven-development/scripts/task-brief" docs/plans/p.md 1 2>&1)
PKGPATH=$(bash "$REVIEW_PACKAGE" docs/plans/p.md "$ROOT_SHA" "$HEAD_SHA" 2>&1)

if [ "$(dirname "$BRIEF")" = "$(dirname "$PKGPATH")" ]; then
    pass "package lands beside the plan's briefs"
else
    fail "package lands beside the plan's briefs" "brief: $(dirname "$BRIEF")  pkg: $(dirname "$PKGPATH")"
fi
UNTRACKED=$(git status --porcelain | grep -c "superpowers" || true)
if [ "$UNTRACKED" -eq 0 ]; then pass "package does not appear in git status"; else fail "package does not appear in git status" "$UNTRACKED entries"; fi
cd / && rm -rf "$T6"

# ---------------------------------------------------------------------------
echo
echo "Outside a git repo"

T7=$(mktemp -d); cd "$T7"
mkdir -p docs/plans && printf '# Plan\n\n### Task 1: X\n\nBody\n' > docs/plans/p.md
OUT8=$(bash "$REVIEW_PACKAGE" docs/plans/p.md HEAD HEAD 2>&1); CODE8=$?
assert_exit_code "$CODE8" 2 "exits 2 outside a git repository"
cd / && rm -rf "$T7"

# ---------------------------------------------------------------------------
echo
echo "─────────────────────────────"
echo "Passed: $PASS   Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
