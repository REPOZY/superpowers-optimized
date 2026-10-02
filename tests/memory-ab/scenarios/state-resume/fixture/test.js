const assert = require('assert');
const { parseName } = require('./src/parse');

assert.strictEqual(parseName('  Ada '), 'Ada');
console.log('ok');
