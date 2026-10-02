# Task 2 done as recorded: RangeError on bad input, numbers still parse.
node -e "
const assert = require('assert'); const { parseAge, parseName } = require('./src/parse');
for (const bad of ['-1', 'abc']) assert.throws(() => parseAge(bad), RangeError, 'parseAge(' + bad + ')');
assert.strictEqual(parseAge('42'), 42);
assert.strictEqual(parseName('  Ada '), 'Ada');
"
