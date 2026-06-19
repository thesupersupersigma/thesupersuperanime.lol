export async function sendVerificationEmail(email: string, verifyUrl: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set — skipping verification email");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thesupersuperanime.lol";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "thesupersuperanime <noreply@thesupersuperanime.lol>",
      to: email,
      subject: "Verify your email — thesupersuperanime.lol",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px; border-radius: 12px; border: 1px solid #2a2a2a;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;">
            Verify your email
          </h1>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            Thanks for signing up! Click the button below to verify your email address and finish setting up your account.
          </p>
          <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">
            Verify Email
          </a>
          <p style="color: #555; font-size: 12px; margin-top: 32px;">
            This link expires in 24 hours. If you didn't create an account, you can ignore this email.
          </p>
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #1f1f1f;">
            <p style="color: #444; font-size: 11px; line-height: 1.6; margin: 0;">
              By verifying your email you agree to our
              <a href="${siteUrl}/terms" style="color: #666; text-decoration: underline;">Terms of Service</a>
              and
              <a href="${siteUrl}/privacy" style="color: #666; text-decoration: underline;">Privacy Policy</a>.
            </p>
          </div>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  return true;
}

export async function sendWelcomeEmail(email: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set — skipping welcome email");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thesupersuperanime.lol";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "thesupersuperanime <noreply@thesupersuperanime.lol>",
      to: email,
      subject: "Welcome to thesupersuperanime.lol",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px; border-radius: 12px; border: 1px solid #2a2a2a;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;">
            You're all set 🎉
          </h1>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
            Thanks for signing up to <strong style="color: #e5e5e5;">thesupersuperanime.lol</strong> — your email is verified and your account is ready to go.
          </p>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            If you have suggestions or bugs to report, head to <a href="${siteUrl}/issues" style="color: #2563eb; text-decoration: none;">thesupersuperanime.lol/issues</a> — I respond to all of them.
          </p>
          <p style="color: #555; font-size: 12px; margin-top: 32px;">
            This email was sent to ${email} because you created an account. Reply here if you have questions.
          </p>
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #1f1f1f;">
            <p style="color: #444; font-size: 11px; line-height: 1.6; margin: 0;">
              By using thesupersuperanime.lol you agree to our
              <a href="${siteUrl}/terms" style="color: #666; text-decoration: underline;">Terms of Service</a>
              and
              <a href="${siteUrl}/privacy" style="color: #666; text-decoration: underline;">Privacy Policy</a>.
            </p>
          </div>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  return true;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set")

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "thesupersuperanime <noreply@thesupersuperanime.lol>",
      to: email,
      subject: "Reset your password",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px; border-radius: 12px; border: 1px solid #2a2a2a;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;">
            Reset your password
          </h1>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            Someone requested a password reset for your thesupersuperanime account. 
            If that wasn't you, ignore this email — your password won't change.
          </p>
          <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">
            Reset Password
          </a>
          <p style="color: #555; font-size: 12px; margin-top: 32px;">
            This link expires in 1 hour.
          </p>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Resend error: ${JSON.stringify(err)}`)
  }

  return true
}

export async function sendStreakAtRiskEmail(email: string, streakDays: number) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set — skipping streak at risk email");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thesupersuperanime.lol";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "thesupersuperanime <noreply@thesupersuperanime.lol>",
      to: email,
      subject: `Your ${streakDays}-day streak is at risk 🔥`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px; border-radius: 12px; border: 1px solid #2a2a2a;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;">
            Your ${streakDays}-day streak is at risk 🔥
          </h1>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            You haven't watched anything today yet. Watch an episode today to keep your ${streakDays}-day streak alive — let it slip and it resets to zero.
          </p>
          <a href="${siteUrl}/" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">
            Keep the streak alive!
          </a>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  return true;
}

export async function sendLeaderboardPassedEmail(email: string, passerName: string, newRank: number) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set — skipping leaderboard passed email");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thesupersuperanime.lol";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "thesupersuperanime <noreply@thesupersuperanime.lol>",
      to: email,
      subject: "You've been passed on the leaderboard 📉",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px; border-radius: 12px; border: 1px solid #2a2a2a;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;">
            You've been passed on the leaderboard 📉
          </h1>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            <strong style="color: #e5e5e5;">${passerName}</strong> just passed you on the leaderboard. You're now rank #${newRank}.
          </p>
          <a href="${siteUrl}/leaderboard" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">
            View Leaderboard
          </a>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  return true;
}

export async function sendNewEpisodeEmail(email: string, animeTitle: string, episodeNum: number, animeId: number) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set — skipping new episode email");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thesupersuperanime.lol";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "thesupersuperanime <noreply@thesupersuperanime.lol>",
      to: email,
      subject: `New episode of ${animeTitle} just dropped 🎬`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px; border-radius: 12px; border: 1px solid #2a2a2a;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;">
            New episode just dropped 🎬
          </h1>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            Episode ${episodeNum} of <strong style="color: #e5e5e5;">${animeTitle}</strong> is now available to watch.
          </p>
          <a href="${siteUrl}/watch/${animeId}/${episodeNum}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">
            Watch Now
          </a>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  return true;
}

export async function sendCompletionNudgeEmail(email: string, animeTitle: string, episodesLeft: number, animeId: number) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set — skipping completion nudge email");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thesupersuperanime.lol";
  const episodeWord = episodesLeft === 1 ? "episode" : "episodes";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "thesupersuperanime <noreply@thesupersuperanime.lol>",
      to: email,
      subject: `You're almost done with ${animeTitle}!`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px; border-radius: 12px; border: 1px solid #2a2a2a;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;">
            You're almost done! 🏁
          </h1>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            You're only ${episodesLeft} ${episodeWord} away from finishing <strong style="color: #e5e5e5;">${animeTitle}</strong>. Why stop now?
          </p>
          <a href="${siteUrl}/anime/${animeId}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">
            Finish Watching
          </a>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  return true;
}