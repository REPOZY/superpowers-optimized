# Superpowers Optimized — Codex Integration Test Results

**Date:** <!-- fill in -->
**Codex version:** <!-- e.g. codex-cli 0.x.x -->
**WSL distro:** <!-- e.g. Ubuntu 24.04 -->
**Node version:** <!-- e.g. v22.x.x -->
**Plugin version:** <!-- e.g. 6.3.0 -->

---

## Setup

### S1 — VERSION file exists
Status: TBD
Observed:
Notes:

### S2 — Skills symlink
Status: TBD
Observed:
Notes:

### S3 — hooks.json linked
Status: TBD
Observed:
Notes:

### S4 — codex_hooks enabled
Status: TBD
Observed:
Notes:

### S5 — Node.js available
Status: TBD
Observed:
Notes:

---

## Group 1: SessionStart hook

### T1.1 — Basic context injection
Status: TBD
Hook notification visible:
Section tags reported by model:
Model mentioned using-superpowers:
Notes:

### T1.2 — project-map.md injection
Status: TBD
Model answered from context (no Read tool):
Notes:

### T1.3 — state.md injection
Status: TBD
Model knew active task from context:
Notes:

---

## Group 2: UserPromptSubmit hook (skill routing)

### T2.1 — Debug prompt routing
Status: TBD
Hook notification visible:
Model referenced systematic-debugging:
Notes:

### T2.2 — TDD prompt routing
Status: TBD
Hook notification visible:
Model referenced test-driven-development:
Notes:

### T2.3 — Micro-task skips routing
Status: TBD
Hook fired:
Skills suggested:
Notes:

### T2.4 — Empty prompt (unit test confirm)
Status: TBD
Stdout output:
Notes:

---

## Group 3: PreToolUse hook (Bash safety)

### T3.1 — rm -rf ~ blocked
Status: TBD
Command blocked:
Block message:
Command executed anyway:
Notes:

### T3.2 — cat .env blocked
Status: TBD
Bash cat blocked:
Block reason:
Read tool bypass observed:
Notes:

### T3.3 — curl | bash blocked
Status: TBD
Block message:
Notes:

### T3.4 — git status passes
Status: TBD
Command ran normally:
Notes:

### T3.5 — git push --force-with-lease passes
Status: TBD
Command ran normally:
Notes:

---

## Group 4: Stop hook (discipline reminders)

### T4.1 — TDD reminder for source file change
Status: TBD
Hook fired:
systemMessage visible:
Reminder text:
Notes:

### T4.2 — Loop guard (unit test confirm)
Status: TBD
Unit test result:
Notes:

### T4.3 — Decision log reminder for SKILL.md
Status: TBD
Reminder text:
Notes:

---

## Group 5: Install path fallback

### T5.1 — Old path fallback
Status: TBD
Old path present:
Notes:

### T5.2 — Missing install returns {}
Status: TBD
Command output:
Notes:

---

## Group 6: Negative tests (confirmed limitations)

### T6.1 — Read tool not blocked
Status: TBD
File read successfully:
Any hook block:
Notes:

### T6.2 — Windows hooks disabled
Status: TBD
Notes:

---

## Summary

Total tests: 19
Passed:
Partial:
Failed:
N/A:

### Critical failures (if any)

### Unexpected behaviors

### Platform notes
