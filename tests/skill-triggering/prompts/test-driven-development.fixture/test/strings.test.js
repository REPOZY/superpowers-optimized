const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/strings');

test('slugify lowercases and joins words with dashes', () => {
  assert.strictEqual(slugify('  Hello World! '), 'hello-world');
});
