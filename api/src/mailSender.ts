import { apiConfig } from './config.js';

export type MailMessage = { to: string; subject: string; text: string };
export interface MailSender {
  readonly provider: 'brevo' | 'local';
  readonly available: boolean;
  send(message: MailMessage): Promise<void>;
}

export async function sendPasswordChangedNotice(sender: MailSender, to: string): Promise<void> {
  try {
    await sender.send({ to, subject: 'Your QI-Education password was changed',
      text: 'Your QI-Education password was changed. If you did not make this change, contact QI-Education support.' });
  } catch { /* A failed notice never fails or undoes a completed password change. */ }
}
export type MailSettings = {
  BREVO_API_KEY?: string; MAIL_FROM_ADDRESS?: string; MAIL_FROM_NAME?: string; APP_PUBLIC_URL?: string;
};
export function hasMailConfig(settings: MailSettings = apiConfig): boolean {
  return Boolean(settings.BREVO_API_KEY && settings.MAIL_FROM_ADDRESS && settings.APP_PUBLIC_URL);
}

class MailRefused extends Error {}

export class BrevoMailSender implements MailSender {
  readonly provider = 'brevo';
  get available() { return hasMailConfig(this.settings); }
  constructor(private readonly settings: MailSettings, private readonly fetcher: typeof fetch = fetch) {}
  async send(message: MailMessage): Promise<void> {
    if (!this.available) throw new Error('Mail delivery unavailable.');
    try {
      const response = await this.fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { 'api-key': this.settings.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { email: this.settings.MAIL_FROM_ADDRESS, name: this.settings.MAIL_FROM_NAME ?? 'QI-Education' },
          to: [{ email: message.to }], subject: message.subject, textContent: message.text }),
      });
      if (response.status !== 201) {
        // Operators need the reason; log only the status and Brevo's short error code,
        // never its message, the recipient, the key or the mail text.
        const code = (await response.json().catch(() => null) as { code?: unknown } | null)?.code;
        console.warn(`Mail provider refused: status=${response.status} code=${typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : 'unknown'}`);
        throw new MailRefused();
      }
    } catch (error) {
      if (!(error instanceof MailRefused)) console.warn(`Mail provider unreachable: ${error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : 'Error'}`);
      // Never propagate provider response bodies, credentials or the reset link.
      throw new Error('Mail delivery unavailable.');
    }
  }
}

export class LocalMailSender implements MailSender {
  readonly provider = 'local';
  readonly messages: MailMessage[] = [];
  get available() { return process.env.NODE_ENV !== 'production'; }
  constructor(private readonly output: (message: string) => void = message => console.log(message)) {}
  async send(message: MailMessage): Promise<void> {
    if (!this.available) throw new Error('Mail delivery unavailable.');
    this.messages.push({ ...message });
    // Deliberate local mail display, including the complete link; never production diagnostics.
    this.output(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
  }
}

export function createMailSender(settings: MailSettings = apiConfig): MailSender {
  // Credentials in a local .env must never cause a real send from development/tests.
  if (process.env.NODE_ENV !== 'production') return new LocalMailSender();
  return new BrevoMailSender(settings);
}
