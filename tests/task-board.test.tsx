import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskBoard } from "@/app/_components/task-board";
import type { CreateTaskResult, ListTasksResult, Task } from "@/app/_lib/tasks";

const taskA: Task = { id: "1", title: "A", due_date: "2026-12-01", created_at: "2026-11-04T10:00:00.000000Z" };
const taskB: Task = { id: "2", title: "B", due_date: null, created_at: "2026-11-04T10:01:00.000000Z" };

const empty: ListTasksResult = { ok: true, tasks: [] };

function setup(initial: ListTasksResult, impl?: (...args: never[]) => Promise<CreateTaskResult>) {
  const createTask = vi.fn(impl ?? (async () => ({ ok: false, reason: "unavailable" }) as CreateTaskResult));
  render(<TaskBoard initial={initial} createTask={createTask} />);
  return createTask;
}

const titleInput = () => screen.getByLabelText("Title") as HTMLInputElement;
const dueInput = () => screen.getByLabelText("Due date") as HTMLInputElement;
const submitButton = () => screen.getByRole("button", { name: "Add task" }) as HTMLButtonElement;
const form = () => screen.getByRole("form", { name: "Add a task" });

describe("TaskBoard", () => {
  it("AC-001.1 shows the empty message and the form with title, due date and submit", () => {
    setup(empty);
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(form()).toBeInTheDocument();
    expect(titleInput()).toBeInTheDocument();
    expect(dueInput()).toHaveAttribute("type", "date");
    expect(submitButton()).toBeInTheDocument();
    expect(screen.queryByText("Tasks could not be loaded. Please try again later.")).not.toBeInTheDocument();
  });

  it("AC-001.3 lists tasks in the given order with due dates and No due date", () => {
    setup({ ok: true, tasks: [taskA, taskB] });
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("A");
    expect(items[0]).toHaveTextContent("Due 2026-12-01");
    expect(items[1]).toHaveTextContent("B");
    expect(items[1]).toHaveTextContent("No due date");
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });

  it("AC-001.4 shows the due date verbatim in any time zone", () => {
    const original = process.env.TZ;
    for (const tz of ["Pacific/Honolulu", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      const { unmount } = render(<TaskBoard initial={{ ok: true, tasks: [taskA] }} createTask={vi.fn()} />);
      expect(screen.getByText("Due 2026-12-01")).toBeInTheDocument();
      unmount();
    }
    process.env.TZ = original;
  });

  it("AC-001.6 submits the title with a null due date, appends the task and clears the form", async () => {
    const createTask = setup({ ok: true, tasks: [taskA] }, async () => ({
      ok: true,
      task: { ...taskB, title: "Buy milk" },
    }));
    fireEvent.change(titleInput(), { target: { value: "Buy milk" } });
    fireEvent.submit(form());
    await waitFor(() => expect(screen.getByText("Buy milk")).toBeInTheDocument());
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith({ title: "Buy milk", due_date: null });
    const items = screen.getAllByRole("listitem");
    expect(items[items.length - 1]).toHaveTextContent("Buy milk");
    expect(items[items.length - 1]).toHaveTextContent("No due date");
    expect(titleInput().value).toBe("");
    expect(dueInput().value).toBe("");
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });

  it("AC-001.7 sends the picked due date and shows it on the new task", async () => {
    const createTask = setup(empty, async () => ({ ok: true, task: { ...taskA, title: "Report" } }));
    fireEvent.change(titleInput(), { target: { value: "Report" } });
    fireEvent.change(dueInput(), { target: { value: "2026-12-01" } });
    fireEvent.submit(form());
    await waitFor(() => expect(screen.getByText("Due 2026-12-01")).toBeInTheDocument());
    expect(createTask).toHaveBeenCalledWith({ title: "Report", due_date: "2026-12-01" });
  });

  it.each([[""], ["   "]])("AC-001.8 blocks the title %j, shows Enter a title. and keeps the due date", (title) => {
    const createTask = setup(empty);
    fireEvent.change(titleInput(), { target: { value: title } });
    fireEvent.change(dueInput(), { target: { value: "2026-12-01" } });
    fireEvent.submit(form());
    expect(createTask).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a title.")).toBeInTheDocument();
    expect(dueInput().value).toBe("2026-12-01");
  });

  it("AC-001.9 shows Enter a title. on invalid-title, keeping inputs and the list", async () => {
    setup({ ok: true, tasks: [taskA] }, async () => ({ ok: false, reason: "invalid-title" }));
    fireEvent.change(titleInput(), { target: { value: "x" } });
    fireEvent.change(dueInput(), { target: { value: "2026-12-01" } });
    fireEvent.submit(form());
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(titleInput().value).toBe("x");
    expect(dueInput().value).toBe("2026-12-01");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("AC-001.10 limits the title field to 200 characters and sends a 200 character title unshortened", async () => {
    const createTask = setup(empty, async (input) => ({
      ok: true,
      task: { ...taskB, title: (input as { title: string }).title },
    }));
    expect(titleInput()).toHaveAttribute("maxlength", "200");
    fireEvent.change(titleInput(), { target: { value: "y".repeat(250) } });
    expect(titleInput().value).toBe("y".repeat(200));
    fireEvent.submit(form());
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask).toHaveBeenCalledWith({ title: "y".repeat(200), due_date: null });
    expect(await screen.findByRole("list", { name: "Tasks" })).toHaveTextContent("y".repeat(200));
  });

  it("AC-001.11 shows the load error in place of the list and the empty message, form still present", () => {
    setup({ ok: false });
    expect(screen.getByRole("alert")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(form()).toBeInTheDocument();
  });

  it("AC-001.14 shows the save error on unavailable and keeps inputs and list", async () => {
    setup(empty, async () => ({ ok: false, reason: "unavailable" }));
    fireEvent.change(titleInput(), { target: { value: "Buy milk" } });
    fireEvent.change(dueInput(), { target: { value: "2026-12-01" } });
    fireEvent.submit(form());
    expect(await screen.findByText("The task could not be saved. Please try again.")).toBeInTheDocument();
    expect(titleInput().value).toBe("Buy milk");
    expect(dueInput().value).toBe("2026-12-01");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
  });

  it("AC-001.14 treats a rejected createTask like unavailable", async () => {
    setup(empty, async () => {
      throw new Error("boom");
    });
    fireEvent.change(titleInput(), { target: { value: "Buy milk" } });
    fireEvent.submit(form());
    expect(await screen.findByText("The task could not be saved. Please try again.")).toBeInTheDocument();
    expect(titleInput().value).toBe("Buy milk");
  });

  it("AC-001.15 sends one request for repeated submits while pending, disables the button, then re-enables it", async () => {
    let resolve!: (r: CreateTaskResult) => void;
    const createTask = setup(
      empty,
      () =>
        new Promise<CreateTaskResult>((r) => {
          resolve = r;
        }),
    );
    fireEvent.change(titleInput(), { target: { value: "Buy milk" } });
    fireEvent.submit(form());
    fireEvent.submit(form());
    fireEvent.click(submitButton());
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();
    resolve({ ok: false, reason: "unavailable" });
    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(createTask).toHaveBeenCalledTimes(1);
  });
});
