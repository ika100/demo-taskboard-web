"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { TITLE_MAX_LENGTH } from "@/app/_lib/tasks";
import type { CreateTaskResult, ListTasksResult, NewTask, Task } from "@/app/_lib/tasks";

export type TaskBoardProps = {
  initial: ListTasksResult;
  createTask(input: NewTask): Promise<CreateTaskResult>;
};

export function TaskBoard({ initial, createTask }: TaskBoardProps) {
  const [created, setCreated] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef<boolean>(false);

  const tasks: Task[] = initial.ok ? [...initial.tasks, ...created] : created;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (title.trim() === "") {
      setTitleError(true);
      setSaveError(false);
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      let result: CreateTaskResult;
      try {
        result = await createTask({ title, due_date: dueDate === "" ? null : dueDate });
      } catch {
        result = { ok: false, reason: "unavailable" };
      }
      if (result.ok) {
        setCreated((prev) => [...prev, result.task]);
        setTitle("");
        setDueDate("");
        setTitleError(false);
        setSaveError(false);
      } else if (result.reason === "invalid-title") {
        setTitleError(true);
        setSaveError(false);
      } else {
        setSaveError(true);
        setTitleError(false);
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="tasks">
      {!initial.ok && (
        <p role="alert" className="tasks-error">
          Tasks could not be loaded. Please try again later.
        </p>
      )}
      {initial.ok && tasks.length === 0 && <p className="tasks-empty">No tasks yet.</p>}
      {tasks.length > 0 && (
        <ul aria-label="Tasks" className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="task-item">
              <span className="task-title">{task.title}</span>
              <span className="task-due">{task.due_date ? `Due ${task.due_date}` : "No due date"}</span>
            </li>
          ))}
        </ul>
      )}
      <form aria-label="Add a task" className="task-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            name="title"
            type="text"
            maxLength={TITLE_MAX_LENGTH}
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX_LENGTH))}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "task-title-error" : undefined}
          />
          {titleError && (
            <p id="task-title-error" className="field-error">
              Enter a title.
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="task-due-date">Due date</label>
          <input
            id="task-due-date"
            name="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Add task
        </button>
        {saveError && (
          <p role="alert" className="field-error">
            The task could not be saved. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
