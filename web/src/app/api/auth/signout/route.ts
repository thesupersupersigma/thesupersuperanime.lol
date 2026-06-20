import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("user-session");
  cookieStore.delete("discord-linked");
  cookieStore.delete("email-verified");
  return NextResponse.json({ success: true });
}
