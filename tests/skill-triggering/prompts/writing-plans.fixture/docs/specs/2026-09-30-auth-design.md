# Auth Design

**Status: Approved** (2026-09-30, reviewed in brainstorming)

## Goal
Email/password accounts with JWT sessions for the existing Express API.

## Decisions
- Passwords hashed with bcrypt (cost 12); never logged.
- JWT signed with HS256 using `JWT_SECRET`; 24h expiry, no refresh tokens in v1.
- `requireAuth` middleware reads `Authorization: Bearer <token>`; 401 on missing or expired token.
- Password reset: single-use token (32 random bytes, stored hashed, 1h expiry) emailed via the existing `src/mail.js` transport.
- Users stored in the existing `src/db.js` in-memory store; a real database is out of scope.

## Components
- `src/models/user.js` — create, findByEmail, setPassword
- `src/routes/auth.js` — POST /register, POST /login, POST /password-reset, POST /password-reset/confirm
- `src/middleware/require-auth.js`
- `src/mail.js` — already exists; add `sendResetEmail(to, link)`

## Out of scope
OAuth, refresh tokens, rate limiting.
