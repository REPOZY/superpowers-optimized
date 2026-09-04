---
name: verification-before-completion
description: >
  Invoke BEFORE saying "done", "tests pass", "ready to merge", or any
  completion claim. Requires fresh command output as evidence — no
  completion without proof. Also routed by using-superpowers at task end.
---

# Verification Before Completion

Do not claim success without fresh command evidence.

## Gate

Before any completion claim:

1. Identify the command that proves the claim.
2. Run that command now, in full — no truncated invocation, no reading a previous run's output. Scope it per *Scale Verification to the Change* below.
3. Inspect exit code and output.
4. State results exactly as observed.
5. **If the change includes a condition or gate that determines when something applies: explicitly state what it does NOT cover. If the answer reveals a gap that should be covered, fix it before proceeding.**

## Scale Verification to the Change

The gate says run the command that proves the claim. It does not say every edit earns a
full-matrix run. Pick the **narrowest command that could actually catch a break from this
change** — a five-minute suite run after a one-line edit is not rigor, it is a reflex.

| Change | Verify with |
|---|---|
| Comment, docstring, one-line edit | that file's tests; nothing else |
| One module, component, or panel | its suite, plus a typecheck if types moved |
| Several modules inside one subsystem | the suites for those modules |
| A shared type, a public contract, a cross-cutting rule, or two subsystems together | the full suite / matrix |
| Dependency, build config, or CI change | the full suite / matrix |

Rules:

- **Widen on evidence, not pre-emptively.** Run the narrow command first. Widen when something
  connected actually breaks — not because it might.
- **Never imply an unrun suite is green.** Report it as unrun. "Radar suite passes; full core
  suite not run" is honest. "Tests pass" is not.
- **The bottom two rows are not negotiable.** Shared contracts and dependency changes have
  unbounded blast radius — targeted tests are blindest exactly there.
- **A project's own matrix wins.** If the repo's CLAUDE.md defines verification scope, follow it
  over this table.

Scoping the command is not a licence to skip the gate. The narrow command still has to run, and
its real output still has to be read.

## Applies To

- "Tests pass"
- "Bug is fixed"
- "Build succeeds"
- "Ready to merge"
- Any equivalent wording

## Not Acceptable

- "Should pass"
- "Looks good"
- Trusting old outputs
- Trusting subagent reports without verification

## Minimum Evidence Examples

- Tests: command output with zero failures
- Build: successful exit code
- Bugfix: reproduction case now passes
- Requirements: explicit checklist against plan

## Stub Scan (Implementation Tasks)

When verifying completion of any task that created or modified production code, run a stub scan before claiming done:

```bash
grep -rn "TODO\|FIXME\|placeholder\|NotImplementedError\|raise NotImplementedError" <src-dir> \
  --include="*.ts" --include="*.js" --include="*.py" --include="*.go" --include="*.rs" \
  | grep -v -i "test\|spec\|__tests__"
```

Adjust `<src-dir>` and `--include` patterns to the project's language and source structure. If any match falls in a file this task created or modified: the task is not done. Remove the stub or confirm with the user it is intentional before claiming completion.

## Regression Test Verification (Red-Green Cycle)

When verifying a bugfix with a regression test, the test must prove it catches the bug:

```
✅ Write test → Run (PASS) → Revert fix → Run (MUST FAIL) → Restore fix → Run (PASS)
❌ "I've written a regression test" (without red-green verification)
```

A regression test that has never been seen failing proves nothing — it might pass for the wrong reason.

## Agent Delegation Verification

When a subagent reports success, verify independently:

```
✅ Agent reports success → Check VCS diff → Verify changes match task → Report actual state
❌ Trust agent report at face value
```

## Rule

If evidence is missing, report current status as unverified and run the command.

## Self-Consistency Verification

When the verification reasoning is non-trivial (multi-step inference, ambiguous evidence, or configuration changes), apply multi-path reasoning (see `self-consistency-reasoner`) before declaring the verdict:

1. Generate 3 **independent** reasoning paths evaluating: "Does this evidence actually prove the claim?"
2. Each path should approach the evaluation differently: one checks what the evidence proves, one checks what it *doesn't* prove, one considers alternative explanations for the output.
3. Take the majority-vote verdict:
   - **All agree "verified"**: claim is proven.
   - **Majority agrees but minority dissents**: flag what the dissenting path identified — it may reveal a gap in the evidence.
   - **No majority**: evidence is insufficient. Do not claim completion. State what additional evidence is needed.

This prevents the most expensive verification failure: confidently declaring "done" based on evidence that doesn't actually prove what you think it proves.

## Configuration Change Verification

When a change affects provider selection, feature flags, environment variables, or credentials:

Do not claim success based on operation success alone. Verify the **outcome reflects the intended change**.

| Change | Insufficient | Required |
|--------|-------------|----------|
| Switch API/LLM provider | Status 200 | Response contains expected provider or model name |
| Enable feature flag | No errors | Feature behavior is actually active |
| Change environment | Deploy succeeds | Logs or env vars reference the new environment |
| Set credentials | Auth succeeds | Authenticated identity or context is correct |

**Gate:**
1. Identify: what should be *different* after this change?
2. Locate: where is that difference observable? (response field, log line, runtime behavior)
3. Run: a command that shows the observable difference.
4. Verify: output contains the expected difference — not just that the operation completed.
