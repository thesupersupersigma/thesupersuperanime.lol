"use server";

import { headers } from "next/headers";
import { setAuthCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIpFromHeaders } from "@/lib/request-ip";
import { redirect } from "next/navigation";

/**
 * Attempts allowed per IP per window. Only FAILED attempts are counted, so a
 * legitimate visitor with the right password is never throttled no matter how
 * many times they sign in.
 */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const password = formData.get("password") as string;

  if (!password) {
    return { error: "Password is required" };
  }

  // This action had NO rate limiting of any kind: unlimited guesses at full
  // server throughput against the single secret that is currently the entire
  // perimeter. `/login` is in the proxy's always-public list, so nothing
  // upstream throttled it either.
  const ip = getClientIpFromHeaders(await headers());
  const key = `site-login:${ip}`;
  if (!checkRateLimit(key, MAX_FAILURES, WINDOW_MS, Date.now(), { record: false })) {
    console.warn("[login] rate limited", { ip });
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const success = await setAuthCookie(password);

  if (!success) {
    // Record on failure only.
    checkRateLimit(key, MAX_FAILURES, WINDOW_MS);
    return { error: "Wrong password" };
  }

  redirect("/");
}
