import nodemailer from 'nodemailer';
import { env } from './env.js';

let transporter: nodemailer.Transporter | null = null;
if (env.EMAIL_ENABLED && env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.NODE_ENV === 'production' && env.SMTP_PORT !== 465,
    tls: { minVersion: 'TLSv1.2' },
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

export interface SendResult { ok: boolean; error?: string; messageId?: string; }
export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!transporter) return { ok: false, error: 'email_not_configured' };
  if (!to.includes('@') || !subject.trim() || !text.trim()) return { ok: false, error: 'invalid_email_message' };
  try {
    const info = await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text });
    return { ok: true, messageId: info.messageId };
  } catch {
    return { ok: false, error: 'email_send_failed' };
  }
}
export function emailConfigured(): boolean { return transporter !== null; }
