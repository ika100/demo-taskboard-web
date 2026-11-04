import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

afterEach(() => vi.unstubAllGlobals());

describe("HomePage", () => {
  it("renders the task page without starter content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    render(await HomePage());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
    for (const text of ["Up and running", "What's included", "Get started", "Check health"]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("still renders heading and form when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
