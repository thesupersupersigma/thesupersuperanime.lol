import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Auth handled by middleware — only reachable with valid admin-auth cookie

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.status) {
    return NextResponse.json({ error: "status required" }, { status: 400 });
  }

  const valid = ["open", "resolved"];
  if (!valid.includes(body.status)) {
    return NextResponse.json({ error: "status must be open or resolved" }, { status: 400 });
  }

  const issue = await db.issue.update({
    where: { id },
    data: { status: body.status },
  });

  return NextResponse.json({ ok: true, issue });
}
