const http = require('node:http');
const db = require('./db');

function handler(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, users: db.users.length }));
  }
  res.writeHead(404);
  res.end();
}

module.exports = { handler, server: http.createServer(handler) };
