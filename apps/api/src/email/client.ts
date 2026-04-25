import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

let transporter: Transporter | null = null;

/**
 * Lazily-constructed nodemailer transport. Tests can override with
 * `setMailer()` to inject a fake. We do NOT construct the transport at module
 * load time so that test setups can wire up a mock before any mutation runs.
 */
export function getMailer(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
  });
  return transporter;
}

export function setMailer(t: Transporter): void {
  transporter = t;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  await getMailer().sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
}
