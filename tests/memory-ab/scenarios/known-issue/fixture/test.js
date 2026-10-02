const assert = require('assert');
const schema = require('./generated/schema.js');
const { validate } = require('./src/validate');

assert.ok(schema.user);
assert.ok(validate('user', { email: 'a@b.c', name: 'Ada' }));
assert.ok(!validate('order', { id: 1 }));
console.log('ok');
