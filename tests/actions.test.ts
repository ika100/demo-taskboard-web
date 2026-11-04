import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskAction } from "@/app/actions";

const fetchMock = vi.fn();
const created = { id: "1", title: "Buy milk", due_date: null, created_at: "2026-11-04T10:00:00.000000Z" };

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

describe("createTaskAction", () => {
  it.each([[""], ["   "], [undefined], [42]])(
    "AC-001.8 rejects the title %j as invalid-title without calling the API",
    async (title) => {
      const result = await createTaskAction({ title, due_date: "2026-12-01" } as never);
      expect(result).toEqual({ ok: false, reason: "invalid-title" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("AC-001.6 sends an empty due date as null and returns the created task", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
    const result = await createTaskAction({ title: "Buy milk", due_date: "" });
    expect(result).toEqual({ ok: true, task: created });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.14 returns unavailable instead of throwing when the API is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(createTaskAction({ title: "Buy milk", due_date: null })).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
