import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Readiness must not depend on the task API: the page has to load during an API outage (AC-001.13). */
export function GET() {
  return NextResponse.json({ status: "ready" });
}
