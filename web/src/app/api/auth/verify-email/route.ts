import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/resend";

/**
 * GET /api/auth/verify-email?token=TOKEN
 *
 * Redirect-based verification endpoint (canonical URL that can be used
 * as a direct link or fallback). The page at /account/verify-email handles
 * the in-page UX by calling verifyEmailAction from actions.ts instead.
 */
export async function GET(req: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/account/verify-email-error`);
  }

  try {
    const user = await db.user.findUnique({ where: { emailVerifyToken: token } });

    if (!user || !user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      return NextResponse.redirect(`${siteUrl}/account/verify-email-error`);
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpires: null,
      },
    });

    // Send welcome email — fire and forget so the redirect isn't held up
    void sendWelcomeEmail(user.email).catch(err =>
      console.error("[verify-email route] welcome email failed:", err)
    );

    return NextResponse.redirect(`${siteUrl}/account?verified=1`);
  } catch (err) {
    console.error("[verify-email route]", err);
    return NextResponse.redirect(`${siteUrl}/account/verify-email-error`);
  }
}
