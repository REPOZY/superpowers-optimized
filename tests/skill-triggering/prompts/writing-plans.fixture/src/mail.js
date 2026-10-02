// Mail transport. In development it logs instead of sending.
function send(to, subject, body) {
  console.log(`[mail] to=${to} subject=${subject}\n${body}`);
}

module.exports = { send };
