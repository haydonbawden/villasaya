import { config } from '../config.ts';

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Delivery is intentionally pluggable and defaults to logging.
 *
 * A villa workspace is usually stood up before any SMTP credentials exist, and
 * an invitation that cannot be emailed still has to reach the staff member —
 * so the link is printed to the server log and also returned to the inviting
 * user, who can send it over WhatsApp. Set SMTP_URL to switch to real delivery.
 */
export async function sendEmail(email: OutboundEmail): Promise<{ delivered: boolean }> {
  if (!config.smtpUrl) {
    console.log(
      `\n[mail] (no SMTP configured — logging instead)\n  to:      ${email.to}\n  subject: ${email.subject}\n  ${email.text.split('\n').join('\n  ')}\n`,
    );
    return { delivered: false };
  }

  // Kept as a dynamic import so nodemailer stays an optional dependency: the
  // app runs without it until someone actually configures SMTP.
  try {
    // Resolved through a variable so the module is not a hard build-time
    // dependency; installing nodemailer is what turns SMTP delivery on.
    const moduleName = 'nodemailer';
    const nodemailer = (await import(moduleName)) as {
      createTransport: (url: string) => {
        sendMail: (options: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const transport = nodemailer.createTransport(config.smtpUrl);
    await transport.sendMail({
      from: config.mailFrom,
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
    return { delivered: true };
  } catch (error) {
    console.error('[mail] delivery failed, falling back to log', error);
    console.log(`[mail] to: ${email.to}\n${email.text}`);
    return { delivered: false };
  }
}

export function invitationEmail(input: {
  to: string;
  villaName: string;
  inviterName: string;
  roleName: string;
  link: string;
  expiresAt: string;
}): OutboundEmail {
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to join ${input.villaName}`,
    text: [
      `Hi,`,
      ``,
      `${input.inviterName} has invited you to join ${input.villaName} as ${input.roleName}.`,
      ``,
      `Accept the invitation here:`,
      input.link,
      ``,
      `The link expires on ${new Date(input.expiresAt).toDateString()}.`,
      ``,
      `If you were not expecting this, you can ignore this email.`,
    ].join('\n'),
  };
}
