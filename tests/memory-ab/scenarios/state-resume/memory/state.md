# State
Current Goal: Harden input parsing in src/parse.js

Decisions:
- Invalid input throws RangeError, never returns NaN or null — the form handler relies on try/catch.

Plan Status:
- [x] Task 1: parseName trims whitespace (test in test.js)
- [ ] Task 2: parseAge throws RangeError for negative or non-numeric input — NEXT
- [ ] Task 3: parseEmail validation — blocked, needs a design decision from the user

Evidence:
- node test.js passes for Task 1
