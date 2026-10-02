// Input parsing for the signup form.
function parseName(s) {
  return String(s).trim();
}

function parseAge(s) {
  return parseInt(s, 10);
}

function parseEmail(s) {
  return String(s);
}

module.exports = { parseName, parseAge, parseEmail };
