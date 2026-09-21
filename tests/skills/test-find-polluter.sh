#!/usr/bin/env bash
# Deterministic tests for skills/systematic-debugging/find-polluter.sh
#
# No Claude CLI, no network, no npm — a fake `npm` is placed on PATH so the
# script's test invocations are fully controlled.
#
# Regression origin: the script passed the caller's pattern straight to
# `find -path`, but `find .` emits `./`-prefixed paths, so the documented
# pattern `src/**/*.test.ts` matched nothing. `wc -l` on that empty result
# returned 1, so the script announced "Found 1 test files", ran zero tests,
# and reported "No polluter found - all tests clean!" — a silent false clean.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FIND_POLLUTER="${REPO_ROOT}/skills/systematic-debugging/find-polluter.sh"

PASS=0
FAIL=0

pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
fail() {
    echo "  [FAIL] $1"
    echo "    $2"
    FAIL=$((FAIL + 1))
}

assert_contains() {
    local output="$1" pattern="$2" name="$3"
    if printf '%s' "$output" | grep -qF "$pattern"; then
        pass "$name"
    else
        fail "$name" "expected to find: $pattern"
        printf '%s\n' "$output" | sed 's/^/      /'
    fi
}

assert_not_contains() {
    local output="$1" pattern="$2" name="$3"
    if printf '%s' "$output" | grep -qF "$pattern"; then
        fail "$name" "did not expect to find: $pattern"
        printf '%s\n' "$output" | sed 's/^/      /'
    else
        pass "$name"
    fi
}

assert_exit_code() {
    local actual="$1" expected="$2" name="$3"
    if [ "$actual" -eq "$expected" ]; then
        pass "$name"
    else
        fail "$name" "expected exit $expected, got $actual"
    fi
}

# Build a fixture tree. POLLUTER_REL names the test file whose run creates the
# pollution marker; empty means no test pollutes.
#
# The tree deliberately includes a test file directly under src/ so the
# collapsed form of `src/**/*.test.ts` is exercised alongside the nested form.
make_fixture() {
    local dir="$1" polluter="$2"
    mkdir -p "$dir/src/nested/deep" "$dir/bin"

    : > "$dir/src/alpha.test.ts"
    : > "$dir/src/nested/beta.test.ts"
    : > "$dir/src/nested/deep/gamma.test.ts"
    : > "$dir/src/not-a-test.ts"

    cat > "$dir/bin/npm" <<EOF
#!/usr/bin/env bash
# Fake npm: creates the pollution marker only for the designated polluter.
POLLUTER="$polluter"
if [ -n "\$POLLUTER" ]; then
  for arg in "\$@"; do
    case "\$arg" in
      *"\$POLLUTER") mkdir -p "\$(dirname "polluted.marker")" 2>/dev/null; : > "polluted.marker" ;;
    esac
  done
fi
exit 0
EOF
    chmod +x "$dir/bin/npm"
}

run_in_fixture() {
    local dir="$1"; shift
    ( cd "$dir" && PATH="$dir/bin:$PATH" bash "$FIND_POLLUTER" "$@" 2>&1 )
}

echo "find-polluter.sh"
echo

# ---------------------------------------------------------------------------
echo "Discovery"

TMP1=$(mktemp -d)
make_fixture "$TMP1" "gamma.test.ts"
OUT1=$(run_in_fixture "$TMP1" 'polluted.marker' 'src/**/*.test.ts')
CODE1=$?

assert_contains "$OUT1" "Found 3 test files" "discovers all three test files through a bare pattern"
assert_not_contains "$OUT1" "Found 1 test files" "does not report the phantom single file from empty-input wc -l"
assert_not_contains "$OUT1" "not-a-test.ts" "does not match non-test files"
rm -rf "$TMP1"

# ---------------------------------------------------------------------------
echo
echo "Polluter identification"

TMP2=$(mktemp -d)
make_fixture "$TMP2" "gamma.test.ts"
OUT2=$(run_in_fixture "$TMP2" 'polluted.marker' 'src/**/*.test.ts')
CODE2=$?

assert_contains "$OUT2" "FOUND POLLUTER" "reports that a polluter was found"
assert_contains "$OUT2" "gamma.test.ts" "names the correct polluting test file"
assert_exit_code "$CODE2" 1 "exits 1 when a polluter is found"
rm -rf "$TMP2"

# ---------------------------------------------------------------------------
echo
echo "Caller-supplied ./ prefix"

TMP3=$(mktemp -d)
make_fixture "$TMP3" "gamma.test.ts"
OUT3=$(run_in_fixture "$TMP3" 'polluted.marker' './src/**/*.test.ts')

assert_contains "$OUT3" "Found 3 test files" "a ./-prefixed pattern is not double-prefixed into a never-matching form"
rm -rf "$TMP3"

# ---------------------------------------------------------------------------
echo
echo "Collapsed **/ form"

TMP4=$(mktemp -d)
make_fixture "$TMP4" "alpha.test.ts"
OUT4=$(run_in_fixture "$TMP4" 'polluted.marker' 'src/**/*.test.ts')

assert_contains "$OUT4" "alpha.test.ts" "matches a test directly under the base dir via the collapsed **/ form"
rm -rf "$TMP4"

# ---------------------------------------------------------------------------
echo
echo "No matches is an error, never a clean bill of health"

TMP5=$(mktemp -d)
make_fixture "$TMP5" ""
OUT5=$(run_in_fixture "$TMP5" 'polluted.marker' 'does/not/exist/**/*.test.ts')
CODE5=$?

assert_not_contains "$OUT5" "all tests clean" "a zero-match pattern never reports all tests clean"
assert_contains "$OUT5" "No test files matched" "explains that the pattern matched nothing"
assert_exit_code "$CODE5" 2 "exits 2 when the pattern matches no files"
rm -rf "$TMP5"

# ---------------------------------------------------------------------------
echo
echo "Genuinely clean run"

TMP6=$(mktemp -d)
make_fixture "$TMP6" ""
OUT6=$(run_in_fixture "$TMP6" 'polluted.marker' 'src/**/*.test.ts')
CODE6=$?

assert_contains "$OUT6" "No polluter found" "reports clean when tests really do not pollute"
assert_exit_code "$CODE6" 0 "exits 0 on a genuinely clean run"
rm -rf "$TMP6"

# ---------------------------------------------------------------------------
echo
echo "Pre-existing pollution"

TMP8=$(mktemp -d)
make_fixture "$TMP8" "gamma.test.ts"
: > "$TMP8/polluted.marker"
OUT8=$(run_in_fixture "$TMP8" 'polluted.marker' 'src/**/*.test.ts')
CODE8=$?

assert_contains "$OUT8" "already exists before any test ran" "refuses to bisect when the marker is already present"
assert_not_contains "$OUT8" "FOUND POLLUTER" "does not blame the first test for pre-existing pollution"
assert_exit_code "$CODE8" 3 "exits 3 when the marker pre-exists"
rm -rf "$TMP8"

# ---------------------------------------------------------------------------
echo
echo "Paths containing spaces"

TMP7=$(mktemp -d)
make_fixture "$TMP7" "space case.test.ts"
mkdir -p "$TMP7/src/space dir"
: > "$TMP7/src/space dir/space case.test.ts"
OUT7=$(run_in_fixture "$TMP7" 'polluted.marker' 'src/**/*.test.ts')

assert_contains "$OUT7" "space case.test.ts" "handles test paths containing spaces"
rm -rf "$TMP7"

# ---------------------------------------------------------------------------
echo
echo "─────────────────────────────"
echo "Passed: $PASS   Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
