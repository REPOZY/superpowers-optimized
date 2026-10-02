const config = require('../config/app.json');

async function request(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    return await fetch(config.baseUrl + path, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { request };
