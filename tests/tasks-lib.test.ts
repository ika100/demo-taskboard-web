import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_TIMEOUT_MS, createTask, listTasks } from "@/app/_lib/tasks";

const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const taskA = { id: "1", title: "A", due_date: "2026-12-01", created_at: "2026-11-04T10:00:00.000000Z" };
const taskB = { id: "2", title: "B", due_date: null, created_at: "2026-11-04T10:01:00.000000Z" };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.API_URL = "http://api.test/";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listTasks", () => {
  it("AC-001.3 returns the tasks in the order the API returned them, unsorted", async () => {
    fetchMock.mockResolvedValue(json([taskA, taskB]));
    const result = await listTasks();
    expect(result).toEqual({ ok: true, tasks: [taskA, taskB] });
  });

  it("AC-001.3 keeps API order even when it is not by due date or title", async () => {
    fetchMock.mockResolvedValue(json([taskB, taskA]));
    const result = await listTasks();
    expect(result.ok && result.tasks.map((t) => t.title)).toEqual(["B", "A"]);
  });

  it("AC-001.5 fetches from API_URL on every call with no-store and a timeout signal", async () => {
    fetchMock.mockImplementation(async () => json([]));
    await listTasks();
    await listTasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/tasks");
    expect(init.cache).toBe("no-store");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(API_TIMEOUT_MS).toBe(5000);
  });

  it.each([
    ["503", () => json({ detail: "Task storage is unavailable." }, 503)],
    ["500", () => json({ detail: "Internal Server Error" }, 500)],
    ["404", () => json({}, 404)],
    ["an object body", () => json({ tasks: [] })],
    ["a non-JSON body", () => new Response("<html>", { status: 200 })],
    ["a malformed element", () => json([{ id: 1, title: "x" }])],
  ])("AC-001.11 reports failure for %s", async (_name, make) => {
    fetchMock.mockResolvedValue(make());
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.11 reports failure for a refused connection and a timeout, without rejecting", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.12 makes exactly one fetch per call, no retry, and recovers on the next call", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json([taskA]));
    expect(await listTasks()).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listTasks()).toEqual({ ok: true, tasks: [taskA] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("createTask", () => {
  it("AC-001.6 posts the title as given and due_date null when empty, and returns the created task", async () => {
    fetchMock.mockResolvedValue(json({ ...taskB, title: "Buy milk" }, 201));
    const result = await createTask({ title: "Buy milk", due_date: null });
    expect(result).toEqual({ ok: true, task: { ...taskB, title: "Buy milk" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/tasks");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: null });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-001.7 sends the due date string unchanged", async () => {
    fetchMock.mockResolvedValue(json(taskA, 201));
    await createTask({ title: "A", due_date: "2026-12-01" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "A", due_date: "2026-12-01" });
  });

  it("AC-001.10 sends a 200 character title unshortened", async () => {
    const title = "x".repeat(200);
    fetchMock.mockResolvedValue(json({ ...taskB, title }, 201));
    const result = await createTask({ title, due_date: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title).toBe(title);
    expect(result.ok).toBe(true);
  });

  it("AC-001.9 maps a 422 naming title to invalid-title", async () => {
    fetchMock.mockResolvedValue(
      json({ detail: [{ loc: ["body", "title"], msg: "too short", type: "string_too_short" }] }, 422),
    );
    expect(await createTask({ title: "x", due_date: null })).toEqual({ ok: false, reason: "invalid-title" });
  });

  it.each([
    ["422 on due_date", () => json({ detail: [{ loc: ["body", "due_date"], msg: "bad", type: "date" }] }, 422)],
    ["422 without detail", () => json({}, 422)],
    ["503", () => json({ detail: "Task storage is unavailable." }, 503)],
    ["500", () => json({ detail: "Internal Server Error" }, 500)],
    ["an unlisted status", () => json({}, 418)],
    ["201 with a malformed body", () => json({ nope: true }, 201)],
  ])("AC-001.14 maps %s to unavailable", async (_name, make) => {
    fetchMock.mockResolvedValue(make());
    expect(await createTask({ title: "x", due_date: null })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("AC-001.14 maps a refused connection and a timeout to unavailable and never retries", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await createTask({ title: "x", due_date: null })).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await createTask({ title: "x", due_date: null })).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
