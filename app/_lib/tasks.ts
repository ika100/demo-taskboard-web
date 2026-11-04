export type Task = { id: string; title: string; due_date: string | null; created_at: string };
export type NewTask = { title: string; due_date: string | null };
export type ListTasksResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "invalid-title" | "unavailable" };

export const API_TIMEOUT_MS = 5000;
export const TITLE_MAX_LENGTH = 200;

type Op = "list" | "create";

function baseUrl(): string {
  const raw = process.env.API_URL?.trim() || "http://localhost:8000";
  return raw.replace(/\/+$/, "");
}

function logFailure(op: Op, detail: { status: number } | { error: string }): void {
  console.error(JSON.stringify({ level: "error", msg: "task api request failed", op, ...detail }));
}

function errorName(e: unknown): string {
  return e instanceof Error && e.name ? e.name : "Error";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isTask(v: unknown): v is Task {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (typeof v.due_date === "string" || v.due_date === null)
  );
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export async function listTasks(): Promise<ListTasksResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/tasks`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (e) {
    logFailure("list", { error: errorName(e) });
    return { ok: false };
  }
  if (res.status === 200) {
    const body = await readJson(res);
    if (Array.isArray(body) && body.every(isTask)) return { ok: true, tasks: body };
  }
  logFailure("list", { status: res.status });
  return { ok: false };
}

function namesTitle(body: unknown): boolean {
  if (!isRecord(body) || !Array.isArray(body.detail)) return false;
  return body.detail.some(
    (d: unknown) => isRecord(d) && Array.isArray(d.loc) && d.loc.length > 0 && d.loc[d.loc.length - 1] === "title",
  );
}

export async function createTask(input: NewTask): Promise<CreateTaskResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/tasks`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (e) {
    logFailure("create", { error: errorName(e) });
    return { ok: false, reason: "unavailable" };
  }
  if (res.status === 201) {
    const body = await readJson(res);
    if (isTask(body)) return { ok: true, task: body };
  } else if (res.status === 422) {
    if (namesTitle(await readJson(res))) {
      logFailure("create", { status: 422 });
      return { ok: false, reason: "invalid-title" };
    }
  }
  logFailure("create", { status: res.status });
  return { ok: false, reason: "unavailable" };
}
