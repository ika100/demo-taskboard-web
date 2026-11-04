"use server";

import { createTask } from "@/app/_lib/tasks";
import type { CreateTaskResult, NewTask } from "@/app/_lib/tasks";

export async function createTaskAction(input: NewTask): Promise<CreateTaskResult> {
  try {
    // The argument crosses the network boundary: treat it as untrusted.
    const raw: unknown = input;
    const record = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>; // untrusted shape
    const title = record.title;
    if (typeof title !== "string" || title.trim() === "") {
      return { ok: false, reason: "invalid-title" };
    }
    const dueDate = record.due_date;
    return await createTask({
      title,
      due_date: typeof dueDate === "string" && dueDate !== "" ? dueDate : null,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
