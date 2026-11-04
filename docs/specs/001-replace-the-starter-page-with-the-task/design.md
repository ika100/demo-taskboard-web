# Design — 001 Replace the starter page with the task list and the create-task form

## Decisions

- **Server-only API access.** The task API (`API_URL`) is a cluster-internal name, so only the web app's server talks to it. The list is fetched in the root page, an async Server Component rendered on every request (`export const dynamic = "force-dynamic"`, `fetch(..., { cache: "no-store" })`) (AC-001.5, AC-001.12). Create goes through one Server Action, `createTaskAction`. No route handler under `app/api/`: a Server Action is the smallest surface and needs no client-side URL.
- **One module owns the HTTP contract.** `app/_lib/tasks.ts` holds the types, the 5 s timeouts and every status-code rule. The page, the action and the client component only see typed results; nothing throws to `error.tsx` (AC-001.11, AC-001.14).
- **The Server Action is passed to the client component as a prop** (`createTask`), not imported by it. The component can then be tested with a plain mock function, without module mocking.
- **Double-submit guard is a ref, not state.** A `useRef<boolean>` in-flight flag is checked synchronously at the start of the submit handler, so a second click or Enter before React re-renders is dropped; `pending` state drives `disabled` on the button (AC-001.15). No automatic retry anywhere (AC-001.14).
- **Due dates are strings, never `Date`s.** `due_date` is rendered verbatim as `Due ${due_date}`; no `Date`, `Intl` or `toLocale*` touches it, so server or browser time zones cannot shift it (AC-001.4).
- **200-character limit twice.** The title input is controlled, has `maxLength={200}` (browser typing and pasting) and the `onChange` handler keeps `value.slice(0, 200)` (covers programmatic changes and tests that use `fireEvent.change`) (AC-001.10). No new test dependency.
- **No `required` attribute on the title input.** Native validation would block the submit and hide the spec's own message "Enter a title." (AC-001.8).
- **`/api/ready` stays free of dependency checks** (AC-001.13): the page must load during an API outage. The route's comment is changed to say so, so nobody adds an API check later.
- The starter components `app/_components/feature-card.tsx` and `app/_components/icons.tsx` are deleted, and so are their CSS rules (hero, eyebrow, grid, card, steps). `.lead`, `.btn*`, `.section*` and `.state*` stay because `not-found.tsx` and `error.tsx` use them (AC-001.16).

No ADR: every decision here is local to this feature.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/tasks.ts` | types, `listTasks()`, `createTask()`: HTTP to the task API, timeouts, response validation, structured error logging | new |
| `app/actions.ts` | `"use server"`: `createTaskAction()`, validates its input, delegates to `createTask()`, never throws | new |
| `app/_components/task-board.tsx` | `"use client"`: the list (or the load error), the add-task form, its state and messages | new |
| `app/page.tsx` | async Server Component: heading "Tasks", calls `listTasks()`, renders `TaskBoard` | rewritten |
| `app/api/ready/route.ts` | unchanged behaviour, comment states it must not check the API | changed (comment) |
| `app/globals.css` | task list and form styles; starter-only rules removed | changed |
| `app/_components/feature-card.tsx`, `app/_components/icons.tsx` | starter content | deleted |
| `docs/env-vars.md` | documents `API_URL` | changed |

## Contract

### Upstream (task API, binding from the system plan)

`GET ${API_URL}/tasks` and `POST ${API_URL}/tasks` exactly as in the spec's Contract section. `API_URL` has its trailing slashes stripped; default when unset: `http://localhost:8000`.

### `app/_lib/tasks.ts` (server-only module)

```ts
export type Task = { id: string; title: string; due_date: string | null; created_at: string };
export type NewTask = { title: string; due_date: string | null };

export type ListTasksResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "invalid-title" | "unavailable" };

export const API_TIMEOUT_MS = 5000;
export const TITLE_MAX_LENGTH = 200;

export function listTasks(): Promise<ListTasksResult>;      // never rejects
export function createTask(input: NewTask): Promise<CreateTaskResult>; // never rejects
```

- `API_URL` is read from `process.env` on every call (not at import), so tests can set it per test.
- `listTasks()` calls `fetch(`${base}/tasks`, { method: "GET", cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(API_TIMEOUT_MS) })`.
  - `200` with a JSON array whose every element has a string `id`, string `title`, and `due_date` that is a string or `null` → `{ ok: true, tasks }` in the API's order, no sorting, no filtering (AC-001.3).
  - Anything else → `{ ok: false }`: any other status, a body that is not JSON, not an array, or holds a malformed element, a rejected `fetch` (refused connection, DNS failure, `AbortSignal` timeout) (AC-001.11). Exactly one `fetch` per call (AC-001.12).
- `createTask(input)` calls `fetch(`${base}/tasks`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ title: input.title, due_date: input.due_date }), signal: AbortSignal.timeout(API_TIMEOUT_MS) })`.
  - `title` is sent exactly as given (not trimmed, not shortened; the API trims) (AC-001.6, AC-001.10). `due_date` is `null` when the date field was empty, otherwise the `YYYY-MM-DD` string (AC-001.6, AC-001.7).
  - `201` with a valid task object (same element check as above) → `{ ok: true, task }`.
  - `422` whose JSON `detail` is an array with an entry whose `loc` ends in `"title"` → `{ ok: false, reason: "invalid-title" }` (AC-001.9).
  - Everything else → `{ ok: false, reason: "unavailable" }`: `422` on `due_date` or without a parseable `detail`, `201` with a malformed body, `503`, `500`, any other status, a rejected `fetch` or timeout. Exactly one `fetch` per call, never retried (AC-001.14).
- Every `{ ok: false }` result logs one JSON line through `console.error`: `{"level":"error","msg":"task api request failed","op":"list"|"create","status":<number>}` or `...,"error":"<error name>"}` for a rejected fetch. Response bodies and titles are never logged.

### `app/actions.ts`

```ts
"use server";
export async function createTaskAction(input: NewTask): Promise<CreateTaskResult>;
```

- Treats the argument as untrusted: `title` not a string, or empty after `trim()` → `{ ok: false, reason: "invalid-title" }` without calling the API. `due_date` not a string or `null`, or an empty string → sent as `null`.
- Otherwise returns `createTask(input)`'s result. Wraps everything in `try/catch`; an unexpected throw returns `{ ok: false, reason: "unavailable" }`.

### `app/_components/task-board.tsx`

```ts
"use client";
export function TaskBoard(props: {
  initial: ListTasksResult;
  createTask: (input: NewTask) => Promise<CreateTaskResult>;
}): JSX.Element;
```

Rendered markup (accessible names are binding; tests query by role and text):

| Element | Markup | Shown when |
|---|---|---|
| task list | `<ul aria-label="Tasks">`, one `<li>` per task in order: the title, then `Due YYYY-MM-DD` or `No due date` | `initial.ok` and at least one task (initial or created) |
| empty message | `<p>No tasks yet.</p>` | `initial.ok`, no tasks, none created |
| load error | `<p role="alert">Tasks could not be loaded. Please try again later.</p>` in place of list and empty message | `!initial.ok` (tasks created afterwards in this page view are listed below the message) |
| form | `<form aria-label="Add a task">` | always |
| title field | `<label for="task-title">Title</label>` + `<input id="task-title" name="title" type="text" maxLength={200}>`, controlled, `aria-invalid` and `aria-describedby="task-title-error"` while the title error shows | always |
| title error | `<p id="task-title-error">Enter a title.</p>` directly after the title input | after a submit with an empty/whitespace title, or `reason: "invalid-title"` |
| due date field | `<label for="task-due-date">Due date</label>` + `<input id="task-due-date" name="due_date" type="date">`, controlled | always |
| submit | `<button type="submit">Add task</button>`, `disabled` while a request is pending | always |
| save error | `<p role="alert">The task could not be saved. Please try again.</p>` inside the form | after `reason: "unavailable"` |

Submit behaviour (`onSubmit` with `preventDefault`, no navigation):

1. If the in-flight ref is set: return (AC-001.15).
2. If `title.trim() === ""`: show the title error, clear the save error, keep both inputs, do not call `createTask` (AC-001.8).
3. Set the ref and `pending`; call `createTask({ title, due_date: dueDate === "" ? null : dueDate })` once.
4. `ok: true`: append `task` to the end of the list, clear both inputs and both messages (AC-001.6, AC-001.7, AC-001.10).
   `invalid-title`: show the title error, keep inputs, list unchanged (AC-001.9).
   `unavailable`: show the save error, keep inputs, list unchanged (AC-001.14).
   A rejected promise is handled like `unavailable`.
5. Finally clear the ref and `pending` (button enabled again).

### `app/page.tsx`

```ts
export const dynamic = "force-dynamic";
export default async function HomePage(): Promise<JSX.Element>;
```

Renders `<section aria-labelledby="tasks-title"><h1 id="tasks-title">Tasks</h1><TaskBoard initial={await listTasks()} createTask={createTaskAction} /></section>`. The only `h1` on the page; no starter text ("Up and running", "What's included", "Get started", "Check health"). Header and footer come from the unchanged `app/layout.tsx` (AC-001.16). The page answers `200` in every list state (AC-001.2, AC-001.11).

### Testing seams

- Unit tests of `app/_lib/tasks.ts` and `app/actions.ts` stub `globalThis.fetch` (`vi.stubGlobal("fetch", vi.fn())`) and set `process.env.API_URL`; a timeout is simulated by rejecting with `new DOMException("timeout", "TimeoutError")`, and the passed `signal` can be asserted to be an `AbortSignal`.
- `TaskBoard` is tested with `render(<TaskBoard initial={...} createTask={vi.fn()} />)`; a pending request is a `createTask` mock returning an unresolved promise.
- The page is tested with `render(await HomePage())` and a stubbed `fetch`.
- E2E (`playwright`, no mock API): with no API reachable the page shows "Tasks", the form and the load error, so the AC-001.2 smoke test passes in every state. The smoke test asserts only the heading "Tasks" and the form, never the list content.

## Risks

- jsdom's `AbortSignal` and Node's `fetch` are different classes; tests must stub `fetch` rather than call a real server from the jsdom environment.
- Coverage gate (80 %): deleting the starter components keeps unused files out of `app/**` coverage.
