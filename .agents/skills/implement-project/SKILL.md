---
name: implement-project
description: Implement an entire Linear project end-to-end. Reads the project and linked TDD from Notion, then loops through tasks in dependency order — coding, running CI checks, performing thermo-nuclear code review, and marking tasks done. Use when the user says "implement project", "/implement-project", or provides a Linear project URL to implement.
---

# Implement Linear Project

You MUST follow this workflow exactly. Every phase is mandatory. Every step within each phase is mandatory. Do NOT skip, reorder, or combine steps. If you catch yourself about to skip a step, STOP and go back.

## Architecture: Main Agent + Subagents

This workflow uses a **two-layer architecture** with **role-separated subagents** to keep context fresh and enforce quality gates:

- **You (the main agent)** — Own the loop. You manage the plan, track state in TodoWrite, update Linear statuses, and commit code. You stay lean and never get bloated with implementation details. You are also the **gatekeeper** — you enforce that the review subagent has returned PASS before you commit.
- **Implementation subagent** (Step 3b) — Writes code and validates it compiles/lints/passes tests. Returns a summary. Its context is then discarded.
- **Review subagent** (Step 3c) — A SEPARATE subagent that loads the thermo-nuclear review skill and reviews the implementation subagent's work with fresh eyes. Returns a PASS/FAIL verdict. This is the blocking gate.
- **Fix subagent** (Step 3c-fix, only if review FAIL) — Fixes blocker findings from the review. Then the review subagent is dispatched AGAIN.

**Critical design principle:** The agent that writes the code NEVER reviews its own code. The review is always a separate subagent invocation. This prevents the "I'll just skip the review since I'm already done" failure mode.

---

## Inputs

The user provides a **Linear project URL** (e.g. `https://linear.app/loomii/project/some-project-slug/issues`).

---

## Phase 1: Gather Context

You MUST complete ALL of the following before writing any code:

1. **Fetch the project** — Use the Linear MCP to get the project and ALL its issues. You MUST pass `includeRelations: true` to get blockers/dependencies.
2. **Read every linked document** — If a TDD (Technical Design Document) is linked as a Notion page or Linear document, you MUST fetch and read it IN FULL. Do not summarize or skim. Read the entire document.
3. **State the architecture** — Output a brief summary (to the user) of what this project does, its key architectural decisions, and the dependency graph between tasks.

**GATE: Do not proceed to Phase 2 until you have read the TDD and can describe the architecture.**

---

## Phase 2: Plan Execution Order

Determine the correct task ordering using these rules (in priority order):

1. Tasks with **no blockers** that **block other tasks** go first.
2. Then tasks with no blockers and no dependents.
3. Tasks that are blocked WAIT until their blockers are marked completed.
4. Respect explicit ordering (milestone order, priority field).
5. Skip tasks already marked "Done" or "Canceled".

You MUST use the TodoWrite tool to output the full ordered plan. Each todo item MUST include the Linear issue identifier (e.g., `LOM-123: Create the user model`).

**GATE: Do not proceed to Phase 3 until the full ordered plan is written via TodoWrite.**

---

## Phase 3: Implementation Loop

For EACH task in the plan, you (the main agent) execute this cycle. The cycle has THREE mandatory subagent dispatches — implementation, review, and (if needed) fix. You CANNOT skip any of them. You CANNOT combine them into one subagent.

### Step 3a: Start the Task

You MUST do ALL THREE of these actions:

1. Call the Linear MCP to set the issue status to **"In Progress"**.
2. Call TodoWrite to mark the corresponding todo as `in_progress`.
3. Read the task description from Linear. Note any referenced files, acceptance criteria, or design decisions.

### Step 3b: Dispatch IMPLEMENTATION Subagent

You MUST use the **Task tool** to dispatch the implementation to a `general` subagent. Do NOT implement the task yourself. Do NOT read files, write code, run commands, or do reviews in the main context.

This subagent's job is ONLY to implement and validate. It does NOT do the code review — that is a separate subagent's job (Step 3c).

Your Task tool prompt MUST include ALL of the following context:

```
You are implementing a task as part of a Linear project. Follow these instructions EXACTLY.

## Task
- **Issue:** <LOM-XXX>
- **Title:** <task title>
- **Description:** <full task description from Linear>
- **Acceptance criteria:** <if any>

## Project Context
- **What this project does:** <1-2 sentence summary>
- **Architecture/TDD decisions relevant to this task:** <relevant excerpts>
- **Codebase conventions:** Match existing style, patterns, and abstractions.

## Instructions — Execute ALL steps in order:

### 1. Implement
Write the code changes needed to satisfy the task.
- If database changes are needed: run `bunx prisma migrate dev --name <descriptive-name>` in `packages/db`.
- If new API routes, workers, or modules are needed: follow existing patterns in the codebase.
- If the TDD specifies an approach, follow it exactly.

### 2. Validate (MANDATORY — DO NOT SKIP)
Run these commands and fix any failures. Loop until ALL pass:
```bash
bun run typecheck
bun run lint
bun run test
```
If database schema changed, ALSO run:
```bash
bun run db:generate
bun run db:migrate
```
Do NOT proceed until every command exits with code 0.

### 3. Report Back
When done, return a response with EXACTLY this structure:
- **Status:** DONE or BLOCKED (if you hit an issue you cannot resolve)
- **Summary:** 1-2 sentences of what you implemented
- **Files changed:** List of files you created or modified
- **Validation:** Confirm all checks pass (typecheck ✓, lint ✓, test ✓)
- **Issues/concerns:** Anything the main agent should know

NOTE: Do NOT do a code review. That is handled by a separate review subagent after you.
```

**IMPORTANT:** Include enough context in the prompt for the subagent to work autonomously. It does NOT have access to your conversation history. Give it everything it needs.

### Step 3c: BLOCKING GATE — Dispatch REVIEW Subagent (MANDATORY, NEVER SKIP)

⛔ **THIS STEP IS A HARD GATE. YOU CANNOT PROCEED TO STEP 3d WITHOUT IT.**
⛔ **IF YOU SKIP THIS STEP, THE ENTIRE WORKFLOW IS INVALID.**
⛔ **"The change is too small" IS NOT A VALID REASON TO SKIP. THERE IS NO VALID REASON TO SKIP.**

After the implementation subagent reports DONE with passing validation, you MUST dispatch a SEPARATE `general` subagent whose SOLE PURPOSE is the thermo-nuclear code review.

This is a different subagent from the one that implemented the code. The reviewer MUST NOT be the implementor. This separation is non-negotiable.

Your Task tool prompt for the review subagent MUST be:

```
You are a code reviewer. Your ONLY job is to perform a thermo-nuclear code quality review. You did NOT write this code. You are reviewing someone else's work with fresh eyes and zero attachment to it.

## What to review
Run `git diff HEAD~1` (or `git diff --cached` if not yet committed) to see the changes made for this task. If that doesn't show changes, run `git status` and read the modified files.

## Task context
- **Issue:** <LOM-XXX>
- **Title:** <task title>
- **What was implemented:** <summary from implementation subagent>
- **Files changed:** <list from implementation subagent>

## Instructions — Execute ALL steps in order:

### 1. Load the review skill
Use the `skill` tool to load `thermo-nuclear-code-quality-review`. Read it carefully. Apply its FULL standards — every rule, every question, every flag.

### 2. Review ALL changes
Apply the thermo-nuclear review to every file that was changed. Be thorough. Be demanding. Be ambitious about structural quality.

For each finding, state:
- The file and location
- What the problem is
- Why it matters
- What the fix should be

### 3. Verdict
Return EXACTLY this structure:
- **Verdict:** PASS or FAIL
- **Finding count:** <number>
- **Findings:** <numbered list of every finding, or "None" if clean>
- **Severity:** For each finding, state if it is a BLOCKER (must fix) or SUGGESTION (nice to have)

Rules for your verdict:
- If there are ANY blocker-level findings → verdict is FAIL
- If there are only suggestions and no blockers → verdict is PASS
- Do NOT be lenient. Apply the full thermo-nuclear standard.
- Do NOT rubber-stamp. If the code makes the codebase messier, say FAIL.
```

### Step 3c-gate: Evaluate Review Result

This is the gate logic. Follow it EXACTLY:

1. **If verdict is PASS** — Proceed to Step 3d. The gate is cleared.
2. **If verdict is FAIL** — You MUST dispatch a FIX subagent (Step 3c-fix), then loop back to dispatch the review subagent AGAIN. Do NOT proceed to Step 3d. Do NOT mark the task as done. The gate remains closed until you get a PASS.
3. **If the review subagent did not return a verdict** — Treat this as FAIL. Re-dispatch the review subagent with clearer instructions.

### Step 3c-fix: Dispatch FIX Subagent (only when review FAILed)

Dispatch a `general` subagent to fix the blocker findings:

```
You are fixing code review findings for a task. The code was reviewed and FAILED the thermo-nuclear code quality review. You must fix ALL blocker findings.

## Task context
- **Issue:** <LOM-XXX>
- **Title:** <task title>
- **Files changed:** <list>

## Review findings to fix
<paste the FULL findings list from the review subagent, including file locations and recommended fixes>

## Instructions:

### 1. Fix every BLOCKER finding
Implement the fix for each blocker finding. Follow the reviewer's recommended approach unless you have a clearly better alternative.

### 2. Re-validate
Run the full validation suite:
```bash
bun run typecheck
bun run lint
bun run test
```
Fix any failures. Loop until all pass.

### 3. Report back
- **Status:** DONE or BLOCKED
- **Findings fixed:** List each finding and what you did
- **Validation:** Confirm all checks pass (typecheck ✓, lint ✓, test ✓)
```

After the fix subagent returns, **loop back to Step 3c** and dispatch the review subagent AGAIN on the updated code. Repeat until you get a PASS verdict. There is no maximum number of iterations — you loop until it passes.

### Step 3d: Commit & Complete the Task

⛔ **You CANNOT reach this step without a PASS verdict from Step 3c.**

If you are about to execute Step 3d and you cannot point to a specific review subagent response that said "Verdict: PASS" — STOP. Go back to Step 3c.

Once you have a PASS verdict from the review subagent, YOU (the main agent) do ALL of these:

1. **Commit the changes:**
   ```bash
   git add -A && git commit -m "<LOM-XXX>: <short description of what was done>"
   ```
2. **Mark Done in Linear** — Call the Linear MCP to set the issue status to **"Done"**.
3. **Mark completed in TodoWrite** — Update the corresponding todo to `completed`.
4. **Output a one-line summary** to the user of what was done, PLUS note: "Code review: PASS (<N> findings fixed)" or "Code review: PASS (clean first pass)".

Then immediately move to the next task — return to **Step 3a**.

---

## Phase 4: Wrap Up

Once ALL tasks are complete:

1. Verify every issue in the project is marked "Done" in Linear (fetch the project again to confirm).
2. Output a final summary listing:
   - What was implemented
   - Key decisions made
   - Any deviations from the TDD and why

---

## Mandatory Rules (NEVER violate these)

1. **NEVER implement tasks yourself.** Always dispatch to a subagent via the Task tool.
2. **NEVER skip the code review subagent.** Every task gets a SEPARATE review subagent (Step 3c). This is non-negotiable. No exceptions. Not for small changes, not for "trivial" tasks, not for any reason.
3. **NEVER let the same subagent implement AND review.** The implementation subagent (Step 3b) and review subagent (Step 3c) MUST be separate Task tool invocations. The reviewer must have fresh eyes.
4. **NEVER mark a task as Done without a PASS verdict from the review subagent.** If you cannot point to a specific review subagent response containing "Verdict: PASS", you cannot mark the task done.
5. **NEVER skip validation.** Every implementation subagent prompt MUST include the validation step.
6. **NEVER start a blocked task.** Wait until all blockers are Done.
7. **NEVER proceed past a GATE** without meeting its condition.
8. **ALWAYS use TodoWrite** to track progress. The user must see status at all times.
9. **ALWAYS update Linear status** at task start (In Progress) and task end (Done).
10. **ALWAYS commit before marking a task as Done.** One commit per task.
11. **ALWAYS include full context in subagent prompts.** The subagent has no memory of your conversation. Give it the task description, relevant TDD excerpts, architecture context, and explicit step-by-step instructions.
12. **ALWAYS report the review outcome** in your one-line summary to the user. State whether the review passed on first try or how many fix iterations were needed.
13. **If ambiguous**, consult the TDD first, then project description, then related issues. Only ask the user if truly stuck after exhausting these sources.

---

## Self-Check: Before Marking Any Task Done

Ask yourself these questions. If ANY answer is "no" — STOP. Do NOT mark the task as done.

**Implementation gate:**
- [ ] Did the implementation subagent (Step 3b) confirm `bun run typecheck` passed?
- [ ] Did the implementation subagent confirm `bun run lint` passed?
- [ ] Did the implementation subagent confirm `bun run test` passed?

**Review gate (THIS IS THE CRITICAL ONE):**
- [ ] Did I dispatch a SEPARATE review subagent (Step 3c)?
- [ ] Was the review subagent a DIFFERENT Task tool invocation from the implementation subagent?
- [ ] Did the review subagent load the `thermo-nuclear-code-quality-review` skill?
- [ ] Did the review subagent return an explicit "Verdict: PASS"?
- [ ] If it returned FAIL, did I dispatch fix + re-review subagents until I got a PASS?

**Completion gate:**
- [ ] Did I commit the changes with a descriptive message?
- [ ] Did I update the Linear issue status to Done?
- [ ] Did I update TodoWrite to mark this completed?
- [ ] Did I tell the user the review outcome (pass on first try, or N iterations)?

If you find yourself wanting to skip the review because "it's obvious" or "the change is small" — that impulse is exactly what this gate exists to prevent. Do. The. Review.
