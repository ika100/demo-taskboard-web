import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage, { dynamic } from "@/app/page";

const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const taskA = { id: "1", title: "A", due_date: "2026-12-01", created_at: "2026-11-04T10:00:00.000000Z" };
const taskB = { id: "2", title: "B", due_date: null, created_at: "2026-11-04T10:01:00.000000Z" };

async function renderPage() {
  render(await HomePage());
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.API_URL = "http://api.test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HomePage", () => {
  it("AC-001.1 shows Tasks, No tasks yet. and the add-task form when the API returns []", async () => {
    fetchMock.mockResolvedValue(json([]));
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Due date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.2 renders the heading and the form with tasks present", async () => {
    fetchMock.mockResolvedValue(json([taskA]));
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add a task" })).toBeInTheDocument();
  });

  it("AC-001.3 lists A before B with their due dates", async () => {
    fetchMock.mockResolvedValue(json([taskA, taskB]));
    await renderPage();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Due 2026-12-01");
    expect(items[1]).toHaveTextContent("No due date");
  });

  it("AC-001.5 is rendered dynamically and fetches without caching on every render", async () => {
    expect(dynamic).toBe("force-dynamic");
    fetchMock.mockImplementation(async () => json([]));
    await renderPage();
    await renderPage();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  });

  it.each([
    ["503", () => json({ detail: "Task storage is unavailable." }, 503)],
    ["a non-array body", () => json({ tasks: [] })],
  ])("AC-001.11 shows the load error for %s and neither the empty message nor an error page", async (_n, make) => {
    fetchMock.mockResolvedValue(make());
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add a task" })).toBeInTheDocument();
  });

  it("AC-001.11 shows the load error for a refused connection", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await renderPage();
    expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
  });

  it("AC-001.12 shows the list on the next load after an outage", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json([taskA]));
    await renderPage();
    expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await renderPage();
    expect(screen.getByText("Due 2026-12-01")).toBeInTheDocument();
  });

  it("AC-001.16 shows none of the starter content", async () => {
    fetchMock.mockResolvedValue(json([]));
    await renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/Up and running/)).not.toBeInTheDocument();
    expect(screen.queryByText(/What's included/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Get started/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Check health/)).not.toBeInTheDocument();
  });
});
