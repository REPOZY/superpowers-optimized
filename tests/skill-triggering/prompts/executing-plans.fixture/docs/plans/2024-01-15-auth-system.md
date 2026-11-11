# Auth System Implementation Plan

**Goal:** Email/password accounts with signed session tokens for the existing HTTP API.
**Spec:** approved 2024-01-14 (password hashing with scrypt, HMAC-signed tokens, 24h expiry).

## Global Constraints
- Node built-ins only (`node:crypto`, `node:test`); no new dependencies.
- Passwords are never stored or logged in plain text.
- Tests: `npm test` (runs `node --test`).

### Task 1: User model

**Files:**
- Create: `src/models/user.js`
- Test: `test/user.test.js`

- [ ] **Step 1: Write failing test** — `createUser(email, password)` stores `{ email, salt, hash }` in `db.users`; `findByEmail(email)` returns it; a duplicate email throws `Error('email taken')`.
- [ ] **Step 2: Run test to verify it fails** — `npm test` → FAIL: cannot find module `../src/models/user`.
- [ ] **Step 3: Implement** `createUser` / `findByEmail` / `verifyPassword(user, password)` with `crypto.scryptSync` and a 16-byte random salt.
- [ ] **Step 4: Run test to verify it passes** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: user model with scrypt hashing`

### Task 2: Session tokens

**Files:**
- Create: `src/auth/token.js`
- Test: `test/token.test.js`

- [ ] **Step 1: Write failing test** — `sign({ email })` returns `<payload>.<hmac>`; `verify(token)` returns the payload; a tampered token or one older than 24h returns `null`.
- [ ] **Step 2: Run test to verify it fails** — `npm test` → FAIL: cannot find module `../src/auth/token`.
- [ ] **Step 3: Implement** with `crypto.createHmac('sha256', process.env.TOKEN_SECRET)`; payload is base64url JSON with an `iat` field.
- [ ] **Step 4: Run test to verify it passes** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: HMAC session tokens with 24h expiry`

### Task 3: Register and login routes

**Files:**
- Modify: `src/app.js`
- Test: `test/routes.test.js`

- [ ] **Step 1: Write failing test** — `POST /register` → 201; repeat → 409. `POST /login` with the right password → 200 `{ token }`; wrong password → 401.
- [ ] **Step 2: Run test to verify it fails** — `npm test` → FAIL: 404 on `/register`.
- [ ] **Step 3: Implement** both routes in the existing request handler using Task 1 and Task 2.
- [ ] **Step 4: Run test to verify it passes** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: register and login routes`
