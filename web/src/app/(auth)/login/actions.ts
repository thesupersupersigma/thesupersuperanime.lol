"use server";

import { setAuthCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const password = formData.get("password") as string;

  if (!password) {
    return { error: "Password is required" };
  }

  const success = await setAuthCookie(password);

  if (!success) {
    return { error: "Wrong password" };
  }

  redirect("/");
}
