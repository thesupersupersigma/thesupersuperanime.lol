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