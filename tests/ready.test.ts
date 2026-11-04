import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/ready/route";

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/ready", () => {
  it("AC-001.13 answers 200 ready without calling the API, even when the API is down", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
