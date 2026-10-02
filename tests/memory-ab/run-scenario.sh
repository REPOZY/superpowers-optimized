#!/bin/bash
# Run one memory scenario headless and judge the outcome.
#
# Usage: ./run-scenario.sh <scenario> [runs=3] [max-turns=12]
#   PLUGIN_DIR  plugin under test (default: this checkout)
#   LABEL       tag printed on each result line (default: current)
#
# Prints one line per run:
#   <label> <scenario> run<i> PASS|FAIL turns=<n> tools=<n> cost=<usd> read_memory=<files> log=<path>
#
# read_memory lists the memory files the model opened itself. A model that
# received the injected memory has no reason to; one that did not has to.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${PLUGIN_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LABEL="${LABEL:-current}"
SCENARIO="$1"
RUNS="${2:-3}"
MAX_TURNS="${3:-12}"
SDIR="$SCRIPT_DIR/scenarios/$SCENARIO"

[ -d "$SDIR" ] || { echo "No scenario: $SCENARIO" >&2; exit 2; }

for i in $(seq 1 "$RUNS"); do
    WORK="$(mktemp -d "${TMPDIR:-/tmp}/memory-ab-${SCENARIO}-XXXXXX")"
    LOG="${WORK}.json"   # outside the project, so the model never sees it

    cp -r "$SDIR/fixture/." "$WORK/"
    # Commit an hour in the past: memory files written afterwards are newer than
    # the last commit, which is what an in-progress task looks like.
    past="$(( $(date +%s) - 3600 )) +0000"
    (cd "$WORK" && git init --quiet && git add -A \
        && GIT_AUTHOR_DATE="$past" GIT_COMMITTER_DATE="$past" \
           git -c user.name=test -c user.email=test@test commit --quiet -m fixture)
    head="$(git -C "$WORK" rev-parse --short HEAD)"
    for f in "$SDIR"/memory/*; do
        sed "s/__HEAD__/$head/g" "$f" > "$WORK/$(basename "$f")"
    done

    (cd "$WORK" && timeout 600 claude -p "$(cat "$SDIR/prompt.txt")" \
        --plugin-dir "$PLUGIN_DIR" \
        --dangerously-skip-permissions \
        --max-turns "$MAX_TURNS" \
        --output-format stream-json --verbose > "$LOG" 2>&1) || true

    # check.sh judges the project state; SCENARIO_LOG lets it also judge what the model said.
    if (cd "$WORK" && SCENARIO_LOG="$LOG" bash "$SDIR/check.sh") > "${WORK}.check" 2>&1; then result=PASS; else result=FAIL; fi

    stats="$(node -e '
        let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
          // read_memory counts only real reads made before the first edit: an
          // existence check ("ls state.md") is not a read, and reading state.md
          // in order to update it after the work is done is not orientation.
          let turns = "?", cost = "?", tools = 0, edited = false; const read = new Set();
          for (const line of s.split("\n")) {
            let j; try { j = JSON.parse(line); } catch { continue; }
            if (j.type === "result") { turns = j.num_turns; cost = (j.total_cost_usd || 0).toFixed(3); }
            if (j.type !== "assistant") continue;
            for (const c of j.message.content || []) {
              if (c.type !== "tool_use") continue;
              tools++;
              if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(c.name)) { edited = true; continue; }
              if (edited) continue;
              const input = c.input || {};
              // Shell segments that name a memory file, minus "ls" existence checks
              const segs = String(input.command || "").split(/&&|\|\||;|\|/).map(x => x.trim()).filter(x => !/^ls\b/.test(x));
              for (const m of ["state.md", "project-map.md", "known-issues.md", "session-log.md"]) {
                if (c.name === "Read" && String(input.file_path || "").endsWith(m)) read.add(m);
                if (c.name === "Bash" && segs.some(x => x.includes(m))) read.add(m);
              }
              // Hook output over the 10,000-char cap is saved under tool-results/;
              // opening it is how a model recovers memory it was not shown.
              if (/tool-results/.test(String(input.file_path || "") + String(input.command || ""))) read.add("hook-overflow-file");
            }
          }
          console.log(`turns=${turns} tools=${tools} cost=${cost} read_memory=${[...read].join(",") || "none"}`);
        });' < "$LOG")"

    echo "$LABEL $SCENARIO run$i $result $stats log=$LOG"
done
