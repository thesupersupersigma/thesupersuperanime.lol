"use server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, getCurrentUser } from "@/lib/auth";
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "@/lib/resend";
import { sendNewSignupAlert } from "@/lib/discord";
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
    const verifyToken = randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        emailVerified: false,
        emailVerifyToken: verifyToken,
        emailVerifyExpires: verifyExpires,
      },
    });
    const cookieStore = await cookies();
    cookieStore.set("user-session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    // Fire-and-forget — don't block signup on email/discord
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const verifyUrl = `${siteUrl}/account/verify-email?token=${verifyToken}`;
    void sendVerificationEmail(email, verifyUrl).catch(err =>
      console.error("[signUp] verification email failed:", err)
    );
    void sendNewSignupAlert(email).catch(err =>
      console.error("[signUp] discord alert failed:", err)
    );
    revalidatePath("/account");
    return { success: true };
  } catch {
    return { error: "Something went wrong." };
  }
}

/**
 * Called from /account/verify-email page — verifies the token in-page
 * rather than doing a redirect so the page can show a proper result.
 */
export async function verifyEmailAction(token: string) {
  if (!token) return { error: "Missing verification token." };
  try {
    const user = await db.user.findUnique({ where: { emailVerifyToken: token } });
    if (!user) return { error: "Invalid or expired verification link." };
    if (!user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      return { error: "This verification link has expired. Request a new one from your account page." };
    }
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
    });
    // Mirror the verified state into a cookie so the Edge middleware gate lets
    // this user through without a linked Discord account.
    const cookieStore = await cookies();
    cookieStore.set("email-verified", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    // Send welcome email (fire-and-forget)
    void sendWelcomeEmail(user.email).catch(err =>
      console.error("[verifyEmail] welcome email failed:", err)
    );
    return { success: true };
  } catch (err) {
    console.error("[verifyEmail]", err);
    return { error: "Something went wrong. Please try again." };
  }
}

/**
 * Re-sends the verification email for the currently logged-in user.
 * Generates a fresh token so the old link is invalidated.
 */
export async function resendVerificationEmailAction() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  if (user.emailVerified) return { error: "Email already verified." };

  try {
    const verifyToken = randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: verifyToken, emailVerifyExpires: verifyExpires },
    });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const verifyUrl = `${siteUrl}/account/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(user.email, verifyUrl);
    return { success: true };
  } catch (err) {
    console.error("[resendVerification]", err);
    return { error: "Failed to send email. Please try again." };
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
    // A verified email passes the gate without Discord. Mirror that into a
    // cookie so the Edge middleware lets them through (it can't read the DB).
    if (user.emailVerified) {
      cookieStore.set("email-verified", "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
      revalidatePath("/account");
      return { success: true }
    }
    revalidatePath("/account");
    return { success: true, requiresDiscord: true }
  } catch { 
    return { error: "Something went wrong." }; 
  } 
} 

export async function logOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("user-session");
  cookieStore.delete("discord-linked");
  cookieStore.delete("email-verified");
  revalidatePath("/account");
}

export async function requestPasswordResetAction(formData: FormData) { 
  const email = formData.get("email")?.toString().toLowerCase().trim(); 
  if (!email) return { error: "Email required." }; 
  try { 
    const user = await db.user.findUnique({ where: { email } }); 
    if (!user) return { success: true } 
    await db.passwordResetToken.updateMany({ 
      where: { userId: user.id, usedAt: null }, 
      data: { usedAt: new Date() }, 
    }) 
    const token = randomBytes(32).toString("hex") 
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) 
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
    await db.passwordResetToken.update({ 
      where: { token }, 
      data: { usedAt: new Date() }, 
    }) 
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

/**
 * Update username, displayName, and/or avatarPreset for an email-only user.
 * Discord users already get these values from their Discord profile.
 */
export async function updateProfileAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };
  if (user.discordId) return { error: "Discord users cannot set a manual profile." };

  const rawUsername = formData.get("username")?.toString().trim() || null;
  const displayName = formData.get("displayName")?.toString().trim() || null;
  const presetRaw = formData.get("avatarPreset")?.toString();
  const avatarPreset = presetRaw ? Number(presetRaw) : null;

  // Validate username format
  if (rawUsername !== null) {
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(rawUsername)) {
      return { error: "Username must be 3–30 characters using only letters, numbers, _ or -." };
    }
    // Uniqueness check — exclude the current user
    const taken = await db.user.findFirst({
      where: { username: rawUsername, NOT: { id: user.id } },
      select: { id: true },
    });
    if (taken) return { error: "That username is already taken." };
  }

  // Validate displayName length
  if (displayName !== null && displayName.length > 50) {
    return { error: "Display name must be 50 characters or fewer." };
  }

  // Validate avatarPreset range
  if (avatarPreset !== null && (avatarPreset < 1 || avatarPreset > 14 || !Number.isInteger(avatarPreset))) {
    return { error: "Invalid avatar selection." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { username: rawUsername, displayName, avatarPreset },
  });

  revalidatePath("/account");
  return { success: true };
}

export async function unlinkDiscordAction() { 
  const user = await getCurrentUser(); 
  if (!user) return { error: "Not logged in" }; 
  await db.user.update({ 
    where: { id: user.id }, 
    data: { discordId: null, discordUsername: null, discordAvatar: null, }, 
  }); 
  const cookieStore = await cookies();
  cookieStore.delete("discord-linked");
  // A verified email still passes the gate after unlinking, so keep that
  // cookie alive; otherwise the middleware would bounce them to link-discord.
  if (user.emailVerified) {
    cookieStore.set("email-verified", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  } else {
    cookieStore.delete("email-verified");
  }
  revalidatePath("/account");
  return { success: true };
}

/**
 * First-time profile setup after email verification.
 * Validates username format & uniqueness, then saves username, displayName,
 * and avatarPreset. On success the page redirects to /.
 */
export async function completeProfileSetupAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const username = formData.get("username")?.toString().trim();
  const displayName = formData.get("displayName")?.toString().trim() || null;
  const presetRaw = formData.get("avatarPreset")?.toString();
  const avatarPreset = presetRaw ? Number(presetRaw) : 1;

  // ── Username validation ──────────────────────────────────────────────────
  if (!username) return { error: "Username is required." };
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return {
      error: "Username must be 3–20 characters using only letters, numbers, or underscores.",
    };
  }

  // Uniqueness — exclude the current user so they can resubmit without a clash
  const taken = await db.user.findFirst({
    where: { username, NOT: { id: user.id } },
    select: { id: true },
  });
  if (taken) return { error: "Username already taken." };

  // ── displayName length ───────────────────────────────────────────────────
  if (displayName !== null && displayName.length > 50) {
    return { error: "Display name must be 50 characters or fewer." };
  }

  // ── avatarPreset range ───────────────────────────────────────────────────
  if (!Number.isInteger(avatarPreset) || avatarPreset < 1 || avatarPreset > 14) {
    return { error: "Invalid avatar selection." };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      username,
      // Explicitly null when blank — the display name fallback chain handles it
      displayName: displayName || null,
      avatarPreset,
    },
  });

  revalidatePath("/");
  return { success: true };
}

export async function deleteAccountAction() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in" };

  // Cascade deletes handle related records via Prisma schema onDelete: Cascade
  await db.user.delete({ where: { id: user.id } });

  const cookieStore = await cookies();
  cookieStore.delete("user-session");
  cookieStore.delete("discord-linked");
  cookieStore.delete("email-verified");

  revalidatePath("/");
  return { success: true };
}