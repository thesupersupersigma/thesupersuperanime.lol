import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroyUserSession } from "@/lib/auth";

export async function POST() {
  await destroyUserSession();
  const cookieStore = await cookies();
  cookieStore.delete("discord-linked");
  cookieStore.delete("email-verified");
  return NextResponse.json({ success: true });
}
