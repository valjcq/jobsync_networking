import nodemailer, { type Transporter } from "nodemailer";

// Outgoing email over SMTP. Optional: features that send mail check
// isEmailConfigured() and stay hidden when the host has not set SMTP up.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 is implicit TLS; 587 and 25 upgrade with STARTTLS.
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("SMTP is not configured (SMTP_HOST and SMTP_FROM)");
  }
  await getTransporter().sendMail({ from: process.env.SMTP_FROM, ...message });
}
