---
spec_id: 001-replace-the-starter-page-with-the-task
title: Replace the starter page with the task list and the create-task form
status: done
priority: P1
shape: web-nextjs
parent: ika100/demo-taskboard-gitops:001-persistent-tasks-and-web-task-list
---

# 001 — Replace the starter page with the task list and the create-task form

## Problem

The taskboard API keeps tasks in memory, so every restart, redeploy or new image pin in an environment wipes all tasks, and two API instances would each show a different list. The web app is still the starter page: people can't see or create tasks without calling the API by hand. Together this means the system can't be used for real work yet. This spec makes tasks survive restarts by keeping them in the system's Postgres database, and turns the web app into the place where people see and add tasks.

## System context

Slice of the system plan `001-persistent-tasks-and-web-task-list` in `ika100/demo-taskboard-gitops` for `demo-taskboard-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.6** Given no tasks exist, when a person opens the web app's root URL, then the page shows the heading "Tasks", the message "No tasks yet." and the form to add a task.
- **AC-001.7** Given tasks "A" (due 2026-12-01) and then "B" (no due date) were created, when a person opens the web app's root URL, then the page lists "A" before "B" and shows "Due 2026-12-01" for "A" and "No due date" for "B" (the due date exactly as stored, `YYYY-MM-DD`, without time zone conversion).
- **AC-001.8** Given a task was created directly through the task API, when a person opens or reloads the web app's root URL, then the task appears in the list.
- **AC-001.9** Given the task list page, when a person enters the title "Buy milk", leaves the due date empty and submits the form, then "Buy milk" appears at the end of the list with "No due date" without leaving the page, the form is cleared, and `GET /tasks` on the API contains the task.
- **AC-001.10** Given the task list page, when a person enters a title, picks the due date 2026-12-01 and submits, then the new task appears at the end of the list with "Due 2026-12-01".
- **AC-001.11** Given the task list page, when a person submits the form with an empty or whitespace-only title, then no task is created, the message "Enter a title." is shown next to the title field and the entered due date is kept.
- **AC-001.12** Given the task list page, when a person types a title, then the title field accepts at most 200 characters, and a task with a title of exactly 200 characters is created.
- **AC-001.13** Given the task API or the database is unavailable, when a person opens the web app's root URL, then the page loads and shows "Tasks could not be loaded. Please try again later." in place of the list, neither an empty list nor a server error page.
- **AC-001.14** Given the task API or the database is unavailable, when a person submits a valid task, then the message "The task could not be saved. Please try again." is shown, the entered title and due date stay in the form, and no task is added to the list.
- **AC-001.15** Given the form was submitted, when the person clicks the submit button again before the first request has finished, then exactly one task is created.

### Contract

The task API is reached inside each environment's namespace at `http://demo-taskboard-api` (port 80, the Service; env var `API_URL` in the web app). Only the web app's server side calls it. JSON over HTTP, `Content-Type: application/json`, UTF-8. No authentication.

### `GET /tasks`

- `200`: a JSON array of every task, oldest first (creation order). Empty array `[]` only when the database holds no tasks.
- `503`: the database cannot be reached (body in Errors). Never `200 []` in that case.

### `POST /tasks`

Request body:

| field | type | rules |
|---|---|---|
| `title` | string, required | surrounding whitespace trimmed by the API; after trimming 1 to 200 characters |
| `due_date` | string `YYYY-MM-DD` or `null`, optional | a real calendar date, no time part; past dates accepted |

The web app sends `due_date: null` (or omits it) when the date field is empty, and the `<input type="date">` value (`YYYY-MM-DD`) otherwise.

- `201`: the created task (object below).
- `422`: validation failed, no task created (body in Errors).
- `503`: the database cannot be reached, no task created.

The API has no idempotency key: two requests create two tasks. Exactly-once from a double click (AC-001.15) is the web app's job (one in-flight request per form).

### Task object

```json
{"id": "3f0c…", "title": "Buy milk", "due_date": "2026-12-01", "created_at": "2026-11-04T10:15:30.123456Z"}
```

| field | type | notes |
|---|---|---|
| `id` | non-empty string | opaque; clients must not parse it |
| `title` | string | trimmed, 1 to 200 characters |
| `due_date` | string `YYYY-MM-DD` or `null` | exactly as stored, no time zone |
| `created_at` | string, ISO 8601 UTC with `Z` | set by the API; unchanged on every later read |

### `GET /ready` (probe, not called by the web app)

- `200` `{"status": "ready"}` when a trivial query (`SELECT 1`) against the database succeeds.
- `503` `{"status": "not ready"}` otherwise. Checked on every call, so it returns to `200` once the database is back, without a restart.
- `GET /health` stays `200` `{"status": "ok"}` regardless of the database.

### Errors

- `422` uses FastAPI's standard validation format: `{"detail": [{"loc": ["body", "<field>"], "msg": "<text>", "type": "<code>"}, ...]}`; the field name is the last element of `loc` (`title` or `due_date`).
- `503` body: `{"detail": "Task storage is unavailable."}`. The API logs the underlying database error; it never puts it in the response.
- Unexpected server failures answer `500` with `{"detail": "Internal Server Error"}`.
- **How the web app treats responses:**
  - `GET /tasks`: anything other than `200` with a JSON array (any 4xx/5xx, a body that is not an array, a network error, a timeout) shows "Tasks could not be loaded. Please try again later." in place of the list; the page itself answers `200`.
  - `POST /tasks`: `201` appends the returned task. `422` naming `title` shows "Enter a title." (it should not happen, the form checks first). Any other status, including `422` on `due_date`, `503`, `500`, an unlisted status, a network error or a timeout, shows "The task could not be saved. Please try again." and keeps the inputs; nothing is added to the list.
- Web app internal: when the server action / route handler fails it returns a typed result to the client (`{ok: true, task}` or `{ok: false, reason: "invalid-title" | "unavailable"}`), never throws to `error.tsx`.

### Timeouts

- **Web app to API, `GET /tasks`:** 5 s total (connect plus response). On timeout or connection refused: the load error message, no retry within the request; the next page load tries again.
- **Web app to API, `POST /tasks`:** 5 s total. On timeout: the save error message, inputs kept, **no automatic retry** (a retry could create a duplicate). The submit button is enabled again after the response or the timeout.
- **API to Postgres:** connect timeout 2 s, statement timeout 3 s per query, so the API answers `503` within about 4 s, inside the web app's 5 s. Connections come from a pool that drops broken connections and reconnects on the next request; no in-API retries.
- **`/ready` to Postgres:** at most 500 ms for the check (the kubelet probe timeout is 1 s); on timeout `/ready` answers `503`.
- When the API pod is down or not ready, the Service has no endpoints and the web app sees a connection error: same handling as a timeout.

### Notes for this repo

The API is reached server-side only, at the env var API_URL (already set to
http://demo-taskboard-api in system.yaml); the browser never calls the API directly
(it is a cluster-internal name). Use a Server Component for the list and a Server
Action (or a route handler under app/api/) for create. Smoke test: AC-001.6's page
shape (heading "Tasks" and the form are present), written so it also passes when
tasks exist; replace the starter smoke in e2e/smoke.spec.ts. Unit/e2e tests mock
the API with the contract below. /api/ready stays independent of the API (the page
must load when the API is down, AC-001.13).

## Stories

As a team member, I want to see every task with its due date when I open the taskboard, so that I know what is pending without calling the API by hand.

As a team member, I want to add a task with an optional due date from the same page, so that I can record work as it comes up.

As a team member, I want a clear message when tasks cannot be loaded or saved, so that I neither mistake an outage for an empty board nor lose what I typed.

## Acceptance criteria

- **AC-001.1** Given the task API answers `GET /tasks` with `200 []`, when a person opens the web app's root URL, then the page shows the heading "Tasks", the message "No tasks yet." and the add-task form with a title field, a due date field and a submit button. (system AC-001.6)
- **AC-001.2** Given any state of the task list (empty or not), when a person opens the web app's root URL, then the page answers `200` and shows the heading "Tasks" and the add-task form. (system AC-001.6) (smoke)
- **AC-001.3** Given the task API answers `GET /tasks` with tasks "A" (`due_date` "2026-12-01") and then "B" (`due_date` `null`), when a person opens the root URL, then "A" is listed before "B", "A" shows "Due 2026-12-01" and "B" shows "No due date", in the order the API returned them with no re-sorting. (system AC-001.7)
- **AC-001.4** Given the task API returns a task with `due_date` "2026-12-01", when the page is rendered in any server or browser time zone (for example UTC-10 and UTC+14), then it shows exactly "Due 2026-12-01". (system AC-001.7)
- **AC-001.5** Given the page was loaded once and afterwards a task was added directly through the task API, when the person reloads the root URL, then the new task appears in the list (the list is fetched from the API on every page load, never served from a cache). (system AC-001.8)
- **AC-001.6** Given the task list page, when a person enters the title "Buy milk", leaves the due date empty and submits, then the web app sends `POST /tasks` with `title` "Buy milk" and `due_date` `null` (or no `due_date`), and on `201` the returned task appears at the end of the list with "No due date" without a page navigation, and the title and due date fields are empty again. (system AC-001.9)
- **AC-001.7** Given the task list page, when a person enters a title, picks the due date 2026-12-01 and submits, then the web app sends `due_date` "2026-12-01", and on `201` the new task appears at the end of the list with "Due 2026-12-01". (system AC-001.10)
- **AC-001.8** Given the task list page, when a person submits with an empty title or a title of only spaces, then no request is sent to the task API, the message "Enter a title." is shown next to the title field, and the due date the person picked is still in the form. (system AC-001.11)
- **AC-001.9** Given the task API answers `POST /tasks` with `422` whose error names `title`, when a person submits, then "Enter a title." is shown next to the title field, the inputs are kept and nothing is added to the list. (system AC-001.11)
- **AC-001.10** Given the title field, when a person types or pastes more than 200 characters, then the field holds only the first 200; and when a title of exactly 200 characters is submitted, then it is sent unshortened and, on `201`, appears in the list. (system AC-001.12)
- **AC-001.11** Given `GET /tasks` answers anything other than `200` with a JSON array (a 4xx or 5xx such as `503`, a body that is not an array, a refused connection, or no answer within 5 seconds), when a person opens the root URL, then the page answers `200`, shows the heading "Tasks", the add-task form and "Tasks could not be loaded. Please try again later." in place of the list, and shows neither "No tasks yet." nor the app's error page. (system AC-001.13)
- **AC-001.12** Given the task API was unavailable on one page load, when it is available again and the person reloads, then the list is shown (no retry within one page load; the next load tries again). (system AC-001.13)
- **AC-001.13** Given the task API is unavailable, when the web app's readiness endpoint is called, then it still answers `200` `{"status": "ready"}`, so the page stays reachable during an API outage. (system AC-001.13)
- **AC-001.14** Given `POST /tasks` answers anything other than `201` or a `422` naming `title` (including `422` on `due_date`, `503`, `500`, an unlisted status, a refused connection, or no answer within 5 seconds), when a person submits a valid task, then "The task could not be saved. Please try again." is shown, the entered title and due date stay in the form, nothing is added to the list, and the request is not retried automatically. (system AC-001.14)
- **AC-001.15** Given the form was submitted and the request has not finished, when the person clicks the submit button again or presses Enter again, then no second request is sent and exactly one task is created; the submit button is disabled while the request is pending and enabled again after the answer, an error or the 5-second timeout. (system AC-001.15)
- **AC-001.16** Given any state of the task list, when a person opens the web app's root URL, then the page shows the site header and footer and none of the starter content: no "Up and running" hero, no "What's included" section and no "Get started" steps. (system AC-001.6)

## Non-goals

- Editing, completing, deleting or reordering tasks.
- Sorting, filtering, searching or paginating the list (the API's order is shown as-is).
- Calling the task API from the browser; the browser talks only to the web app.
- Live updates of the list without a reload (tasks created elsewhere show on the next page load).
- Sign-in, users or per-person task lists.
- Formatting due dates by locale or showing relative dates ("tomorrow"); the date is shown as `YYYY-MM-DD`.
- Validating the due date in the web app beyond what the date field offers; a due date the API rejects is a save error (AC-001.14).

## Open questions

- ~~Confirm: the starter content of the root page (hero, "What's included" cards, "Get started" steps) is removed entirely, and the site header and footer stay.~~ Answered: yes, see AC-001.16.

## Changelog

- 2026-11-04 created
- 2026-11-04 amended: open question answered; the root page drops the starter content and keeps the site header and footer (AC-001.16)
- 2026-11-04 approved
- 2026-11-04 building
- 2026-11-04 done
