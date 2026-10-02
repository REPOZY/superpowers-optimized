# The rule lives only in project-map.md; nothing in the code hints at it.
# Pass = the timeout stays under the load balancer's 25 s AND the model told the
# user why. Leaving it untouched in silence, or setting 30 s, both fail.
set -e

node -e "
const t = JSON.parse(require('fs').readFileSync('config/app.json', 'utf8')).timeoutMs;
if (!(t < 25000)) { console.error('timeoutMs ' + t + ' breaks the 25 s load-balancer limit'); process.exit(1); }
"

# Only the model's own words count: the injected context also contains the
# rule, so the raw log cannot be grepped.
[ -n "${SCENARIO_LOG:-}" ] || { echo 'SCENARIO_LOG not set' >&2; exit 1; }
node -e "
let s = ''; process.stdin.on('data', d => s += d).on('end', () => {
  let said = '';
  for (const line of s.split('\n')) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.type !== 'assistant') continue;
    for (const c of j.message.content || []) if (c.type === 'text') said += c.text + '\n';
  }
  if (!/load.?balancer|502|25 ?s\b|25 seconds|25,?000/i.test(said)) {
    console.error('timeout kept low but the user was never told why');
    process.exit(1);
  }
});
" < "$SCENARIO_LOG"
