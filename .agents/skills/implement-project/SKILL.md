---
name: implement-project
description: Implement an entire Linear project end-to-end. Reads the project and linked TDD from Notion, then loops through tasks in dependency order — coding, running CI checks, performing thermo-nuclear code review, and marking tasks done. Use when the user says "implement project", "/implement-project", or provides a Linear project URL to implement.
---

# Implement Linear Project

Autonomously implement every task in a Linear project from start to finish, following the workflow below in a strict loop.

## Inputs

The user provides a **Linear project URL** (e.g. `https://linear.app/loomii/project/some-project-slug/issues`).

## Phase 1: Gather Context

1. Use the **Linear MCP** to fetch the project and all its issues (with relations, blockers, and status).
2. Read the project description and any linked documents. If a TDD (Technical Design Document) is linked as a Notion page or Linear document, fetch and read it in full.
3. Build a mental model of the feature, its architecture, and the task dependency graph.

## Phase 2: Plan Execution Order

Determine the correct task ordering:

- Tasks with **no blockers** that **block other tasks** go first.
- Then tasks with no blockers and no dependents.
- Tasks that are blocked wait until their blockers are completed.
- Respect any explicit ordering in the project (milestone order, priority).
- Skip tasks already marked as "Done" or "Canceled".

Use the TodoWrite tool to write out the full ordered plan.

## Phase 3: Implementation Loop

For each task in order, repeat this cycle:

### 3a. Start the Task

1. Mark the task as **"In Progress"** in Linear using the Linear MCP.
2. Mark the corresponding todo as `in_progress`.
3. Read the task description carefully. If it references specific files, designs, or acceptance criteria, gather that context.

### 3b. Implement

Write the code changes needed to satisfy the task. Follow existing project conventions:

- Match the codebase style, patterns, and abstractions already in use.
- If the task requires database changes, create the migration (`bunx prisma migrate dev --name <descriptive-name>` in `packages/db`).
- If new API routes, workers, or modules are needed, follow existing patterns in the codebase.

### 3c. Validate

Run the full validation suite and fix any failures:

```
bun run typecheck
bun run lint
bun run test
```

If database schema changed, also run:

```
bun run db:generate
bun run db:migrate
```

All four checks must pass before proceeding. If any fail, fix the issues and re-run until green.

### 3d. Thermo-Nuclear Code Review

Load and apply the `thermo-nuclear-code-quality-review` skill. Perform the review against the changes made for this task. This review is **mandatory** and must pass.

### 3e. Address Review Findings

Implement every change the code review identifies. Do not skip or defer findings — fix them all.

### 3f. Re-validate

After review fixes, run the full validation suite again:

```
bun run typecheck
bun run lint
bun run test
```

If anything fails, fix and re-run. Continue the review-fix-validate cycle until:
- All checks pass, AND
- The thermo-nuclear code review has no remaining findings.

### 3g. Complete the Task

1. Mark the task as **"Done"** in Linear using the Linear MCP.
2. Mark the corresponding todo as `completed`.
3. Move to the next task.

## Phase 4: Wrap Up

Once all tasks are complete:

1. Confirm every issue in the project is marked "Done" in Linear.
2. Summarize what was implemented, noting any decisions made or deviations from the TDD.

## Important Rules

- **Never skip the code review step.** Every task gets reviewed before completion.
- **Never mark a task as done if validation fails.** The loop must be green.
- **Respect the dependency graph.** Do not start a blocked task until its blockers are done.
- **Use TodoWrite throughout.** Keep the user informed of progress at all times.
- **If a task is ambiguous**, check the TDD, project description, and related issues before asking the user. Only ask if truly stuck.
- **Commit atomically per task** if the user has requested commits (otherwise just keep working in the worktree).
