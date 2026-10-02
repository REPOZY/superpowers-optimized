const schema = require('../generated/schema.js');

function validate(type, obj) {
  return schema[type].required.every(k => k in obj);
}

module.exports = { validate };
