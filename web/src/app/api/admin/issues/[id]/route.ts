import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Auth handled by middleware — only reachable with valid admin-auth cookie

const VALID_STATUSES = ["open", "in_progress", "fixed", "wont_fix", "duplicate", "resolved"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const data: { status?: string; priority?: number } = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    data.status = body.status;
  }

  if (body.priority !== undefined) {
    if (typeof body.priority !== "number" || !Number.isInteger(body.priority)) {
      return NextResponse.json({ error: "priority must be an integer" }, { status: 400 });
    }
    data.priority = body.priority;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Provide at least one of: status, priority" }, { status: 400 });
  }

  const issue = await db.issue.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true, issue });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.issue.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
