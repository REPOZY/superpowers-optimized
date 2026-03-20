# Implementer Subagent Prompt Template

Use this template for task implementation.

```
Task tool (general-purpose):
  description: "Implement Task N: <task name>"
  prompt: |
    Implement Task N: <task name>.

    ## Task
    <FULL task text from plan>

    ## Constraints
    <Only constraints relevant to this task>

    ## Subagent rules
    You are a focused subagent. Do NOT invoke any skills from the superpowers-optimized plugin. Do NOT use the Skill tool. Your only job is the task described below.

    ## Required behavior
    The spec-compliance and code-quality review gates depend on the accuracy of your implementation and self-review. A task that passes review the first time keeps the whole pipeline moving — a task that fails review cycles back to you and blocks everything downstream. Take your time, do it right the first time.

    1. Ask questions immediately if requirements are unclear.
    2. Implement only requested scope.
    3. Run task verification commands.
    4. Commit changes.
    5. Perform a self-review before reporting. If self-review finds fixable issues: fix them, re-run verification, then include findings in report.

    ## Report format
    - Implemented:
    - Verification run (commands + outcomes):
    - Commit SHA:
    - Files changed:
    - Self-review findings:
    - Open risks/questions:
```
