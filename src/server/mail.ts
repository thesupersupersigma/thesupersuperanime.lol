import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { getConfig } from '@/config'

let transport: Transporter | undefined

/** Plain-text email branded with SITE_NAME. Only called when SMTP is configured. */
export async function sendMail(to: string, subject: string, lines: string[]) {
  const { smtp, site } = getConfig()
  if (!smtp) throw new Error('SMTP is not configured')
  transport ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  })
  const text = [...lines, '', `— ${site.name}`, site.url].join('\n')
  await transport.sendMail({ from: smtp.from, to, subject: `${subject} · ${site.name}`, text })
}
