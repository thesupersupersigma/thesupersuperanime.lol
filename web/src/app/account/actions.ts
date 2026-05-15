"use server";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function signUpAction(formData: FormData) {
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password || password.length < 6) {
    return { error: "Invalid email or password too short (min 6 chars)." };
  }

  try {
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) return { error: "Email already in use." };

    const passwordHash = hashPassword(password);
    
    const user = await db.user.create({
      data: { email, passwordHash },
    });

    const cookieStore = await cookies();
    cookieStore.set("user-session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    return { error: "Something went wrong." };
  }
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) return { error: "Email and password required." };

  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { error: "Invalid email or password." };
    }

    const cookieStore = await cookies();
    cookieStore.set("user-session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    return { error: "Something went wrong." };
  }
}

export async function logOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("user-session");
  revalidatePath("/account");
}
