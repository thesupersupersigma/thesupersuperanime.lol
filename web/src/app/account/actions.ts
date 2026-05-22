"use server";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/resend";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";

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
    const user = await db.user.create({ data: { email, passwordHash } });
    const cookieStore = await cookies();
    cookieStore.set("user-session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    revalidatePath("/account");
    return { success: true };
  } catch {
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
      maxAge: 60 * 60 * 24 * 30,
    });
    if (user.discordId) {
      cookieStore.set("discord-linked", "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
      revalidatePath("/account");
      return { success: true }
    }
    // Not linked yet — tell the client to redirect
    revalidatePath("/account");
    return { success: true, requiresDiscord: true }
  } catch {
    return { error: "Something went wrong." };
  }
}

export async function logOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("user-session");
  cookieStore.delete("discord-linked"); // clear the gate cookie too
  revalidatePath("/account");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = formData.get("email")?.toString().toLowerCase().trim();
  if (!email) return { error: "Email required." };

  try {
    const user = await db.user.findUnique({ where: { email } });

    // Always return success even if email not found — prevents user enumeration
    if (!user) return { success: true }

    // Invalidate any existing unused tokens for this user
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    const resetUrl = `${siteUrl}/account/reset-password?token=${token}`

    await sendPasswordResetEmail(email, resetUrl)

    return { success: true }
  } catch (err) {
    console.error("[requestPasswordReset]", err)
    return { error: "Failed to send reset email. Try again." }
  }
}

export async function resetPasswordAction(formData: FormData) {
  const token = formData.get("token")?.toString()
  const password = formData.get("password")?.toString()

  if (!token || !password || password.length < 6) {
    return { error: "Invalid request or password too short (min 6 chars)." }
  }

  try {
    const record = await db.passwordResetToken.findUnique({ where: { token } })

    if (!record) return { error: "Invalid or expired reset link." }
    if (record.usedAt) return { error: "This reset link has already been used." }
    if (new Date() > record.expiresAt) return { error: "This reset link has expired. Request a new one." }

    const passwordHash = hashPassword(password)

    await db.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    })

    // Mark token as used
    await db.passwordResetToken.update({
      where: { token },
      data: { usedAt: new Date() },
    })

    // Log them in automatically after reset
    const cookieStore = await cookies()
    cookieStore.set("user-session", record.userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    })

    return { success: true }
  } catch (err) {
    console.error("[resetPassword]", err)
    return { error: "Something went wrong." }
  }
}