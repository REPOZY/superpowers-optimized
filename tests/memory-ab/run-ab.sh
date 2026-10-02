#!/bin/bash
# A/B the memory scenarios: a baseline plugin directory against this checkout.
#
# Usage: ./run-ab.sh <baseline-plugin-dir> [runs=3]
#   e.g. mkdir /tmp/base && git archive v6.8.1 | tar -x -C /tmp/base
#        ./run-ab.sh /tmp/base 3
#
# Runs alternate between the two versions so drift in the model or the API
# affects both equally. Costs real API usage: 3 scenarios x 2 versions x runs.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE="$1"
RUNS="${2:-3}"
CURRENT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS="$(mktemp)"

for i in $(seq 1 "$RUNS"); do
    for scenario in $(ls "$SCRIPT_DIR/scenarios"); do
        PLUGIN_DIR="$BASELINE" LABEL=baseline "$SCRIPT_DIR/run-scenario.sh" "$scenario" 1 | tee -a "$RESULTS"
        PLUGIN_DIR="$CURRENT"  LABEL=current  "$SCRIPT_DIR/run-scenario.sh" "$scenario" 1 | tee -a "$RESULTS"
    done
done

echo ""
echo "=== Summary (pass rate, mean turns, mean cost, runs that opened memory files) ==="
node -e '
const rows = require("fs").readFileSync(0, "utf8").trim().split("\n").map(l => {
  const [label, scenario, , result] = l.split(" ");
  const f = k => (l.match(new RegExp(k + "=(\\S+)")) || [])[1];
  return { label, scenario, pass: result === "PASS", turns: +f("turns"), cost: +f("cost"), read: f("read_memory") !== "none" };
});
const key = r => r.scenario + " " + r.label;
const groups = {};
for (const r of rows) (groups[key(r)] = groups[key(r)] || []).push(r);
const mean = a => (a.reduce((s, x) => s + x, 0) / a.length);
for (const k of Object.keys(groups).sort()) {
  const g = groups[k];
  console.log(`${k.padEnd(32)} pass ${g.filter(r => r.pass).length}/${g.length}  turns ${mean(g.map(r => r.turns)).toFixed(1)}  cost $${mean(g.map(r => r.cost)).toFixed(3)}  opened-memory ${g.filter(r => r.read).length}/${g.length}`);
}' < "$RESULTS"
