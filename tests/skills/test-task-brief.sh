#!/usr/bin/env bash
# Deterministic tests for skills/subagent-driven-development/scripts/task-brief
#
# No Claude CLI, no network. Builds throwaway plan files and asserts on the
# brief the script writes.
#
# The load-bearing case: real plans in this repo contain BOTH "### Task 3:" and
# "### Task 3.1:". Asking for task 3 must return task 3 alone. A prefix match
# would silently concatenate 3.1-3.6 into the brief and no one would notice
# until an implementer built the wrong thing.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TASK_BRIEF="${REPO_ROOT}/skills/subagent-driven-development/scripts/task-brief"

PASS=0
FAIL=0

pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
fail() {
    echo "  [FAIL] $1"
    echo "    $2"
    FAIL=$((FAIL + 1))
}

assert_contains() {
    local hay="$1" needle="$2" name="$3"
    if printf '%s' "$hay" | grep -qF "$needle"; then pass "$name"
    else fail "$name" "expected to find: $needle"; printf '%s\n' "$hay" | sed 's/^/      /' | head -30; fi
}

assert_not_contains() {
    local hay="$1" needle="$2" name="$3"
    if printf '%s' "$hay" | grep -qF "$needle"; then
        fail "$name" "did NOT expect: $needle"; printf '%s\n' "$hay" | sed 's/^/      /' | head -30
    else pass "$name"; fi
}

assert_exit_code() {
    local actual="$1" expected="$2" name="$3"
    if [ "$actual" -eq "$expected" ]; then pass "$name"
    else fail "$name" "expected exit $expected, got $actual"; fi
}

make_plan() {
    cat > "$1" <<'EOF'
# Sample Implementation Plan

**Goal:** Demonstrate the extractor
**Spec:** docs/specs/2026-09-21-sample-design.md

## Global Constraints

- Node 18+ only
- Never import lodash

## Review Focus

- Empty input should not crash

---

### Task 1: First task

**Files:**
- Create: `src/one.js`

**Interfaces:**
- Produces: `makeOne(): string`

- [ ] **Step 1: Write failing test**

#### A subheading inside task 1

This deeper heading belongs to task 1 and must stay in its brief.

### Task 3: Parent task three

This is the PARENT task three body. UNIQUEPARENT3

**Interfaces:**
- Produces: `parentThree(): void`

### Task 3.1: Child task three point one

This is the CHILD task body. UNIQUECHILD31

### Task 3.2: Child task three point two

Another child. UNIQUECHILD32

### Task 10: Double digit task

Double digit body. UNIQUETEN
EOF
}

echo "task-brief"
echo

# ---------------------------------------------------------------------------
echo "Exact task-id matching"

TMP1=$(mktemp -d); cd "$TMP1"; git init -q . 2>/dev/null
make_plan plan.md
OUT1=$(bash "$TASK_BRIEF" plan.md 3 2>&1); CODE1=$?
BRIEF1=$(cat "$OUT1" 2>/dev/null || echo "")

assert_exit_code "$CODE1" 0 "exits 0 for an existing task"
assert_contains "$BRIEF1" "UNIQUEPARENT3" "brief contains the parent task 3 body"
assert_not_contains "$BRIEF1" "UNIQUECHILD31" "brief does NOT bleed into task 3.1"
assert_not_contains "$BRIEF1" "UNIQUECHILD32" "brief does NOT bleed into task 3.2"
assert_not_contains "$BRIEF1" "UNIQUETEN" "brief does NOT bleed into task 10"
cd / && rm -rf "$TMP1"

# ---------------------------------------------------------------------------
echo
echo "Dotted task ids"

TMP2=$(mktemp -d); cd "$TMP2"; git init -q . 2>/dev/null
make_plan plan.md
OUT2=$(bash "$TASK_BRIEF" plan.md 3.1 2>&1)
BRIEF2=$(cat "$OUT2" 2>/dev/null || echo "")

assert_contains "$BRIEF2" "UNIQUECHILD31" "task 3.1 extracts its own body"
assert_not_contains "$BRIEF2" "UNIQUEPARENT3" "task 3.1 does not include parent task 3"
assert_not_contains "$BRIEF2" "UNIQUECHILD32" "task 3.1 stops before task 3.2"
cd / && rm -rf "$TMP2"

# ---------------------------------------------------------------------------
echo
echo "Task 1 vs Task 10 prefix trap"

TMP3=$(mktemp -d); cd "$TMP3"; git init -q . 2>/dev/null
make_plan plan.md
OUT3=$(bash "$TASK_BRIEF" plan.md 1 2>&1)
BRIEF3=$(cat "$OUT3" 2>/dev/null || echo "")

assert_contains "$BRIEF3" "makeOne" "task 1 extracts its own body"
assert_not_contains "$BRIEF3" "UNIQUETEN" "task 1 does not match task 10"
assert_contains "$BRIEF3" "A subheading inside task 1" "deeper subheadings stay inside the task body"
cd / && rm -rf "$TMP3"

# ---------------------------------------------------------------------------
echo
echo "Self-contained context"

TMP4=$(mktemp -d); cd "$TMP4"; git init -q . 2>/dev/null
make_plan plan.md
OUT4=$(bash "$TASK_BRIEF" plan.md 1 2>&1)
BRIEF4=$(cat "$OUT4" 2>/dev/null || echo "")

assert_contains "$BRIEF4" "Never import lodash" "brief carries the plan's Global Constraints"
assert_contains "$BRIEF4" "docs/specs/2026-09-21-sample-design.md" "brief carries the Spec pointer"
assert_not_contains "$BRIEF4" "Empty input should not crash" "brief does NOT carry Review Focus (reviewer-only)"
cd / && rm -rf "$TMP4"

# ---------------------------------------------------------------------------
echo
echo "Plans without the new blocks still work"

TMP5=$(mktemp -d); cd "$TMP5"; git init -q . 2>/dev/null
printf '# Old Plan\n\n### Task 1: Legacy\n\nLegacy body UNIQUELEGACY\n' > plan.md
OUT5=$(bash "$TASK_BRIEF" plan.md 1 2>&1); CODE5=$?
BRIEF5=$(cat "$OUT5" 2>/dev/null || echo "")

assert_exit_code "$CODE5" 0 "a plan predating Global Constraints still extracts"
assert_contains "$BRIEF5" "UNIQUELEGACY" "legacy plan body extracted"
assert_contains "$BRIEF5" "none declared" "missing Global Constraints is stated, not silently blank"
cd / && rm -rf "$TMP5"

# ---------------------------------------------------------------------------
echo
echo "Failure modes are loud"

TMP6=$(mktemp -d); cd "$TMP6"; git init -q . 2>/dev/null
make_plan plan.md
OUT6=$(bash "$TASK_BRIEF" plan.md 99 2>&1); CODE6=$?
assert_exit_code "$CODE6" 2 "exits 2 when the task number is absent"
assert_contains "$OUT6" "No task 99" "names the missing task"

OUT7=$(bash "$TASK_BRIEF" missing-plan.md 1 2>&1); CODE7=$?
assert_exit_code "$CODE7" 1 "exits 1 when the plan file does not exist"

OUT8=$(bash "$TASK_BRIEF" plan.md 2>&1); CODE8=$?
assert_exit_code "$CODE8" 1 "exits 1 on wrong argument count"
cd / && rm -rf "$TMP6"

# ---------------------------------------------------------------------------
echo
echo "Workspace is self-ignoring and plan-scoped"

TMP9=$(mktemp -d); cd "$TMP9"; git init -q . 2>/dev/null
make_plan plan.md
OUT9=$(bash "$TASK_BRIEF" plan.md 1 2>&1)

if [ -f "$OUT9" ]; then pass "prints a path that exists"; else fail "prints a path that exists" "got: $OUT9"; fi
if [ -f ".superpowers/.gitignore" ]; then pass "creates a self-ignoring workspace"; else fail "creates a self-ignoring workspace" ".superpowers/.gitignore missing"; fi
UNTRACKED=$(git status --porcelain 2>/dev/null | grep -c "superpowers" || true)
if [ "$UNTRACKED" -eq 0 ]; then pass "workspace does not appear in git status"; else fail "workspace does not appear in git status" "$UNTRACKED entries"; fi

# Same basename, different directory — must not share a workspace.
mkdir -p other && cp plan.md other/plan.md
OUT10=$(bash "$TASK_BRIEF" other/plan.md 1 2>&1)
if [ "$OUT9" != "$OUT10" ]; then pass "same-basename plans get separate workspaces"; else fail "same-basename plans get separate workspaces" "both resolved to $OUT9"; fi
cd / && rm -rf "$TMP9"

# ---------------------------------------------------------------------------
echo
echo "Works outside a git repository"

TMP11=$(mktemp -d); cd "$TMP11"
make_plan plan.md
OUT11=$(bash "$TASK_BRIEF" plan.md 1 2>&1); CODE11=$?
assert_exit_code "$CODE11" 0 "non-git directory still produces a brief"
if [ -f "$OUT11" ]; then pass "non-git brief path exists"; else fail "non-git brief path exists" "got: $OUT11"; fi
cd / && rm -rf "$TMP11"

# ---------------------------------------------------------------------------
echo
echo "─────────────────────────────"
echo "Passed: $PASS   Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
