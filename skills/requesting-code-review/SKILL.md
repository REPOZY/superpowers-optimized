---
name: requesting-code-review
description: >
  Structured code review against requirements, quality, and security
  standards. Invoke after meaningful code changes or before merge.
  Triggers on: "review my code", "code review", "check this before
  merge", "security review", "is this secure". Routed by
  using-superpowers or executing-plans after implementation.
---

# Requesting Code Review

Request review early to catch issues before they spread.

## When

- After completing a plan task or batch
- After major refactor/feature work
- Before merge or PR finalization

## How

1. Determine review range (`BASE_SHA` -> `HEAD_SHA`).
2. Dispatch `superpowers-optimized:code-reviewer` using `requesting-code-review/code-reviewer.md`.
3. Provide:
- What changed
- Requirement or plan reference
- SHA range
- Short summary

## Security Review (Built-In)

When changes touch security-relevant areas, the code review **must** include a security pass. This is not a separate step — it's part of every review where applicable.

**Triggers automatically when changes touch:**
- Authentication or authorization flows
- Input validation or output encoding
- API endpoints handling user data
- Secrets management or credential handling
- Cryptography, key management, or token generation
- Infrastructure, deployment, or CI/CD configs

**Security checklist:**
- OWASP Top 10 and CWE vulnerability scan
- OWASP API Security Top 10: broken object/function-level authorization, unrestricted resource consumption, SSRF, mass assignment, improper inventory management
- Input validation and injection risk (SQL, XSS, CSRF, command injection)
- Auth flow correctness (session handling, token expiry, privilege escalation, rate limiting on auth endpoints)
- Secrets handling (no hardcoded credentials, proper env var usage)
- Dependency vulnerabilities (known CVEs in imported packages)
- API hardening (security headers, CORS configuration, error message sanitization, rate limiting)
- Logging hygiene (no secrets in logs, adequate audit trail)

**Severity enforcement:**
- Critical/High security findings **block merge** until addressed or the user explicitly accepts the risk with documented rationale.
- Medium security findings should be fixed before merge unless explicitly deferred.

## Adversarial Red Team (Optional)

For changes involving complex logic, concurrency, state management, or critical data paths, dispatch `superpowers-optimized:red-team` in parallel with the code reviewer.

**Triggers when changes touch:**
- State machines or multi-step workflows
- Concurrent access to shared resources
- Complex business logic with branching conditions
- Data transformation pipelines
- Retry/recovery/rollback logic
- Performance-critical paths handling large inputs

The red team agent finds concrete failure scenarios (specific inputs, race conditions, state corruption, resource exhaustion) that checklist-based review misses. It does NOT duplicate the security review — its focus is adversarial logic analysis, not OWASP/CWE compliance.

**Red team critical findings block merge** alongside security critical findings.

## Auto-Fix Pipeline

When the red team report contains Critical or High findings, run the auto-fix pipeline. The pipeline is **ASI-guided and iterative** — fix one finding at a time, starting from the red team's designated ASI, then re-assess before proceeding. This prevents fixes from conflicting with each other when findings touch shared code.

**Iteration loop:**

1. **Identify the entry point.** Start with the finding marked **ASI** in the red team summary. If no ASI is marked, start with the highest-severity finding.
2. **Write the failing test.** Flesh out the test skeleton from the red team report into a real test and run it. It MUST fail — this proves the scenario is real. If the test passes, the finding was a false positive; skip it and note it in the triage, then re-identify the next ASI.
3. **Fix the code.** Make the minimum change to pass the test. Do not refactor or improve surrounding code.
4. **Run a targeted re-check.** Re-read only the files touched by the fix and check whether: (a) the fix introduced any new issues, and (b) any previously reported findings are now resolved as a side effect.
5. **Re-assess the remaining findings.** Update your list — remove resolved findings, re-prioritize if the fix changed the risk landscape. Identify the new ASI.
6. **Repeat** from step 2 until no Critical or High findings remain.

**After the loop completes:**
- Run the full test suite one final time to confirm no regressions across all fixes.
- Report: findings fixed, false positives skipped, any regressions introduced and resolved.

**Skip conditions:**
- If the red team report has zero Critical/High findings, skip the pipeline entirely.
- Medium findings are tracked for later, not auto-fixed.
- If the user explicitly says to skip auto-fix, respect that.

## Triage Rules

- Fix all Critical issues before proceeding.
- Fix Important issues unless user explicitly defers.
- Track Minor issues for later.
- Push back with evidence when feedback is incorrect.

## Output Requirement

Review must include severity, file references, security findings (if applicable), and merge readiness verdict.
