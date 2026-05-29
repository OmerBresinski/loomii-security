---
name: implement-project
description: Implement an entire Linear project end-to-end. Reads the project and linked TDD from Notion, then loops through tasks in dependency order — coding, running CI checks, performing thermo-nuclear code review, and marking tasks done. Use when the user says "implement project", "/implement-project", or provides a Linear project URL to implement.
---

# Implement Linear Project

You MUST follow this workflow exactly. Every phase is mandatory. Every step within each phase is mandatory. Do NOT skip, reorder, or combine steps. If you catch yourself about to skip a step, STOP and go back.

## Architecture: Main Agent + Subagents

This workflow uses a **two-layer architecture** to keep context fresh:

- **You (the main agent)** — Own the loop. You manage the plan, track state in TodoWrite, update Linear statuses, and commit code. You stay lean and never get bloated with implementation details.
- **Subagents (via the Task tool)** — Do the heavy lifting. Each task is dispatched to a `general` subagent that implements, validates, reviews, and fixes. The subagent works in a fresh context and returns a concise summary. When it's done, its bloated context is discarded.

This means YOU never read large files, run test suites, or do code reviews directly. You delegate ALL of that to subagents.

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

For EACH task in the plan, you (the main agent) execute this cycle:

### Step 3a: Start the Task

You MUST do ALL THREE of these actions:

1. Call the Linear MCP to set the issue status to **"In Progress"**.
2. Call TodoWrite to mark the corresponding todo as `in_progress`.
3. Read the task description from Linear. Note any referenced files, acceptance criteria, or design decisions.

### Step 3b: Dispatch to Subagent (MANDATORY)

You MUST use the **Task tool** to dispatch the implementation to a `general` subagent. Do NOT implement the task yourself. Do NOT read files, write code, run commands, or do reviews in the main context.

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

### 3. Code Review (MANDATORY — DO NOT SKIP)
Load the `thermo-nuclear-code-quality-review` skill using the skill tool.
Apply the review to ALL changes you made.
List every finding explicitly.

If you think "this change is too small for review" — STOP. You are wrong. Do the review.

### 4. Fix ALL Review Findings
Implement every fix the review identified. Do not skip or defer any.

### 5. Re-validate (MANDATORY — DO NOT SKIP)
Run the full validation suite AGAIN:
```bash
bun run typecheck
bun run lint
bun run test
```
If anything fails, fix and re-run. Loop between steps 3→4→5 until:
- ALL validation commands pass (exit code 0), AND
- The code review has ZERO remaining findings.

### 6. Report Back
When done, return a response with EXACTLY this structure:
- **Status:** DONE or BLOCKED (if you hit an issue you cannot resolve)
- **Summary:** 1-2 sentences of what you implemented
- **Files changed:** List of files you created or modified
- **Review findings fixed:** Count of findings you addressed
- **Validation:** Confirm all checks pass (typecheck ✓, lint ✓, test ✓)
- **Issues/concerns:** Anything the main agent should know
```

**IMPORTANT:** Include enough context in the prompt for the subagent to work autonomously. It does NOT have access to your conversation history. Give it everything it needs.

### Step 3c: Evaluate Subagent Result

When the subagent returns:

1. **If status is DONE and validation passed** — proceed to Step 3d.
2. **If status is BLOCKED** — Read the subagent's explanation. Either:
   - Dispatch another subagent with additional context to resolve the blocker, OR
   - Ask the user for help if truly stuck.
3. **If the subagent did not report validation or review results** — This means it skipped steps. Dispatch a NEW subagent to run validation and code review on the current state. Do NOT accept incomplete work.

### Step 3d: Commit & Complete the Task

Once the subagent reports DONE with passing validation, YOU (the main agent) do ALL of these:

1. **Commit the changes:**
   ```bash
   git add -A && git commit -m "<LOM-XXX>: <short description of what was done>"
   ```
2. **Mark Done in Linear** — Call the Linear MCP to set the issue status to **"Done"**.
3. **Mark completed in TodoWrite** — Update the corresponding todo to `completed`.
4. **Output a one-line summary** to the user of what was done.

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
2. **NEVER skip the code review.** Every subagent prompt MUST include the review step. If a subagent returns without review results, reject its work and re-dispatch.
3. **NEVER skip validation.** Every subagent prompt MUST include the validation step.
4. **NEVER mark a task as Done if the subagent reported failures.** The pipeline must be green.
5. **NEVER start a blocked task.** Wait until all blockers are Done.
6. **NEVER proceed past a GATE** without meeting its condition.
7. **ALWAYS use TodoWrite** to track progress. The user must see status at all times.
8. **ALWAYS update Linear status** at task start (In Progress) and task end (Done).
9. **ALWAYS commit before marking a task as Done.** One commit per task.
10. **ALWAYS include full context in subagent prompts.** The subagent has no memory of your conversation. Give it the task description, relevant TDD excerpts, architecture context, and explicit step-by-step instructions.
11. **If ambiguous**, consult the TDD first, then project description, then related issues. Only ask the user if truly stuck after exhausting these sources.

---

## Self-Check: Before Marking Any Task Done

- [ ] Did the subagent confirm `bun run typecheck` passed?
- [ ] Did the subagent confirm `bun run lint` passed?
- [ ] Did the subagent confirm `bun run test` passed?
- [ ] Did the subagent confirm it loaded and applied the `thermo-nuclear-code-quality-review` skill?
- [ ] Did the subagent report how many findings it fixed?
- [ ] Did the subagent confirm re-validation passed after fixing findings?
- [ ] Did I commit the changes with a descriptive message?
- [ ] Did I update the Linear issue status to Done?
- [ ] Did I update TodoWrite to mark this completed?

If ANY answer is "no" — do NOT mark the task as done. Either re-dispatch a subagent to complete the missing steps, or investigate what went wrong.
