const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, users: db.users.length }));

module.exports = app;
