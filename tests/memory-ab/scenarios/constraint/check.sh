# Timeout changed AND the changelog rule followed.
node -e "
const assert = require('assert'); const fs = require('fs');
assert.strictEqual(JSON.parse(fs.readFileSync('config/app.json', 'utf8')).timeoutMs, 30000, 'timeoutMs');
const log = fs.readFileSync('CHANGELOG.md', 'utf8');
const unreleased = log.split('## Unreleased')[1].split('## 1.2.0')[0];
assert.ok(/timeout/i.test(unreleased), 'no Unreleased changelog entry for the timeout');
"
