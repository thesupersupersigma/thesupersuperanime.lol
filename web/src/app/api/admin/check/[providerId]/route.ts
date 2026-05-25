import { NextRequest, NextResponse } from "next/server";
import { runSingleProviderCheck } from "@/lib/health-check";
import { getCurrentUser, isAdmin } from "@/lib/auth";

interface Params {
  params: Promise<{ providerId: string }>;
}

/** POST /api/admin/check/[providerId] — run health check on one provider */
export async function POST(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { providerId } = await params;

  try {
    const result = await runSingleProviderCheck(providerId);
    if (!result) {
      return NextResponse.json(
        { error: `Provider "${providerId}" not found` },
        { status: 404 }
      );
    }
    return NextResponse.json({ result });
  } catch (err) {
    console.error(`[/api/admin/check/${providerId}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
