---
spec_id: 001-replace-the-starter-page-with-the-task
shape: web-nextjs
spec_hash: ca3806f6add1
summary: Root page lists tasks from the task API (server-side) and adds tasks through a Server Action, with load/save error states and a double-submit guard
tasks:
  - id: t1
    title: Task API client with types, timeouts and response rules
    files: [app/_lib/tasks.ts, docs/env-vars.md]
    covers: [AC-001.3, AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.14]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: TaskBoard client component (list, form, messages, double-submit guard)
    files: [app/_components/task-board.tsx, app/globals.css]
    covers: [AC-001.1, AC-001.3, AC-001.4, AC-001.6, AC-001.7, AC-001.8, AC-001.9, AC-001.10, AC-001.11, AC-001.14, AC-001.15]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t3
    title: createTaskAction Server Action
    files: [app/actions.ts]
    covers: [AC-001.6, AC-001.8, AC-001.14]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t4
    title: Replace the starter root page with the task page
    files: [app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, app/api/ready/route.ts, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.5, AC-001.11, AC-001.12, AC-001.13, AC-001.16]
    parallel_safe: false
    depends_on: [t2, t3]
---

# Plan — 001 Replace the starter page with the task list and the create-task form

Design and binding module contracts: [design.md](design.md). Coder agent: `web:coder`. No gitops change: `API_URL: http://demo-taskboard-api` is already set for this component in the system's `system.yaml`.

Levels: t1 → t2, t3 (parallel) → t4.

## t1 — Task API client with types, timeouts and response rules

**Files:** app/_lib/tasks.ts, docs/env-vars.md
**Covers:** AC-001.3, AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.14
**Goal:** one server-side module that owns the HTTP contract with the task API and turns every outcome into a typed result, so nothing above it ever handles a status code or a thrown error.

**Implementation notes:**
- Export exactly the types, constants and functions in design.md "`app/_lib/tasks.ts`": `Task`, `NewTask`, `ListTasksResult`, `CreateTaskResult`, `API_TIMEOUT_MS = 5000`, `TITLE_MAX_LENGTH = 200`, `listTasks()`, `createTask()`.
- Read `process.env.API_URL` on every call, strip trailing slashes, default `http://localhost:8000`.
- Both calls: `cache: "no-store"`, `signal: AbortSignal.timeout(API_TIMEOUT_MS)`, one `fetch`, no retry; never reject (catch everything).
- `listTasks`: `200` + array of valid elements → `{ ok: true, tasks }` in API order; everything else → `{ ok: false }`.
- `createTask`: body `{ title, due_date }` with `title` unchanged; `201` + valid task → ok; `422` with a `detail[]` entry whose `loc` ends in `"title"` → `invalid-title`; everything else → `unavailable`.
- One structured `console.error` JSON line per failure (`level`, `msg`, `op`, `status` or `error` name); never log bodies or titles.
- Add `API_URL` to `docs/env-vars.md` (new "Upstream" table: default `http://localhost:8000`, set to `http://demo-taskboard-api` by the gitops repo, server-side only, never `NEXT_PUBLIC_`).

**Done when:** the acceptance tests for `app/_lib/tasks.ts` (response handling of AC-001.3, .5, .6, .7, .9, .10, .11, .12, .14) pass; `devbox run quality` is clean.

## t2 — TaskBoard client component (list, form, messages, double-submit guard)

**Files:** app/_components/task-board.tsx, app/globals.css
**Covers:** AC-001.1, AC-001.3, AC-001.4, AC-001.6, AC-001.7, AC-001.8, AC-001.9, AC-001.10, AC-001.11, AC-001.14, AC-001.15
**Goal:** the interactive part of the page: render the initial list result, the add-task form and every message exactly as in design.md "`app/_components/task-board.tsx`".

**Implementation notes:**
- `"use client"`; props `{ initial: ListTasksResult; createTask: (input: NewTask) => Promise<CreateTaskResult> }` (types imported with `import type` from `@/app/_lib/tasks`).
- Markup, accessible names and texts exactly as the design table: `ul[aria-label="Tasks"]`, "No tasks yet.", load error `role="alert"`, `form[aria-label="Add a task"]`, labels "Title" / "Due date", button "Add task", "Enter a title." with `id="task-title-error"`, save error `role="alert"`.
- Due date shown verbatim as `Due ${due_date}`, else `No due date`; no `Date`/`Intl` (AC-001.4).
- Title input controlled, `maxLength={TITLE_MAX_LENGTH}`, `onChange` keeps `value.slice(0, 200)`; no `required` attribute.
- Submit handler follows design steps 1 to 5: in-flight `useRef` guard, client-side empty-title check without calling `createTask`, one call, append on ok and clear inputs, keep inputs on errors, rejected promise = unavailable, `finally` re-enables the button.
- After a load error, tasks created in this view are listed below the error message.
- `globals.css`: add styles for the task list, form, field errors (use existing tokens); remove the starter-only rules `.hero`, `.eyebrow`, `.dot`, `.hero-title`, `.actions`, `.grid`, `.card*`, `.steps*` and the hero animation; keep `.lead`, `.btn*`, `.section*`, `.state*`. Layout must not overflow at 375 px width.

**Done when:** the `TaskBoard` acceptance tests (AC-001.1 empty state, .3, .4, .6, .7, .8, .9, .10, .11 message, .14, .15) pass; `devbox run quality` is clean.

## t3 — createTaskAction Server Action

**Files:** app/actions.ts
**Covers:** AC-001.6, AC-001.8, AC-001.14
**Goal:** the single server entry point for creating a task, safe against untrusted input and never throwing to the client.

**Implementation notes:**
- `"use server"`; `export async function createTaskAction(input: NewTask): Promise<CreateTaskResult>`.
- Non-string or whitespace-only `title` → `{ ok: false, reason: "invalid-title" }` without a `fetch`.
- `due_date`: a non-empty string is passed on; anything else (empty string, `undefined`, wrong type) becomes `null`.
- Delegate to `createTask`; `try/catch` around everything, an unexpected throw → `{ ok: false, reason: "unavailable" }`.

**Done when:** the acceptance tests for `createTaskAction` pass; `devbox run quality` is clean.

## t4 — Replace the starter root page with the task page

**Files:** app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, app/api/ready/route.ts, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.5, AC-001.11, AC-001.12, AC-001.13, AC-001.16
**Goal:** wire it together: the root page becomes an always-dynamic Server Component that loads the list per request and renders `TaskBoard`, and the starter content is gone.

**Implementation notes:**
- `app/page.tsx`: `export const dynamic = "force-dynamic"`; async `HomePage` renders `<section aria-labelledby="tasks-title"><h1 id="tasks-title">Tasks</h1><TaskBoard initial={await listTasks()} createTask={createTaskAction} /></section>`; no starter imports or text.
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (no longer used; keeps the coverage gate honest).
- `app/api/ready/route.ts`: behaviour unchanged (`200 {"status":"ready"}`); replace the "add dependency checks here" comment with one stating that readiness must not depend on the task API (AC-001.13).
- `tests/page.test.tsx`: these starter-page tests assert the removed hero, cards and steps; replace them with tests of the new page (`render(await HomePage())` with a stubbed `fetch`: heading "Tasks", form present, starter texts absent). Do not touch the acceptance test files the testers wrote.
- `e2e/home.spec.ts`: replace the assertions on the starter `h1` "demo-taskboard-web" and the "Check health" link with the heading "Tasks" and the header's "Health" nav link; keep the landmark, 404 and 375 px overflow tests. These run without a reachable API, so they must pass with the load-error state.

**Done when:** all acceptance tests pass (page-level: AC-001.1, .2, .5, .11, .12, .13, .16), `devbox run test` meets the coverage gate, `devbox run quality` is clean, and `devbox run e2e` passes without a running task API.
