import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrevoMailSender, createMailSender, LocalMailSender } from './mailSender.js';

const settings = { BREVO_API_KEY: 'stub-key', MAIL_FROM_ADDRESS: 'sender@example.test', MAIL_FROM_NAME: 'QI Academy', APP_PUBLIC_URL: 'https://example.test' };
const message = { to: 'user@example.test', subject: 'Subject', text: 'Plain message' };
describe('US-P009 mail sender', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it.each(['development', undefined])('DEF-048 hosted marker refuses local mail with NODE_ENV=%s', async mode => {
    vi.stubEnv('NODE_ENV', mode); vi.stubEnv('VERCEL', '1');
    const output = vi.fn(); const sender = new LocalMailSender(output);
    const selected = createMailSender({});
    expect(selected.provider).toBe('brevo'); expect(selected.available).toBe(false);
    expect(createMailSender(settings).provider).toBe('brevo');
    expect(sender.available).toBe(false);
    await expect(sender.send({ ...message, text: '#token=HOSTED_CANARY' })).rejects.toThrow();
    expect(output).not.toHaveBeenCalled(); expect(sender.messages).toEqual([]);
  });
  it('AC01 sends the confirmed plain-text Brevo request with injected fetch only', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"messageId":"stub"}', { status: 201 }));
    await new BrevoMailSender(settings, fetcher).send(message);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options).toMatchObject({ method: 'POST', headers: { 'api-key': 'stub-key', 'Content-Type': 'application/json', Accept: 'application/json' } });
    expect(JSON.parse(options!.body as string)).toEqual({ sender: { email: settings.MAIL_FROM_ADDRESS, name: 'QI Academy' },
      to: [{ email: message.to }], subject: message.subject, textContent: message.text });
    expect(options!.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([400, 401, 429, 500])('AC03 refuses provider %i without exposing response data', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Sensitive provider data', { status }));
    await expect(new BrevoMailSender(settings, fetcher).send(message)).rejects.toThrow('Mail delivery unavailable.');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('AC03 hides network/timeout details without logging message or credentials', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('stub-key and private reset token'));
    await expect(new BrevoMailSender(settings, fetcher).send(message)).rejects.toThrow('Mail delivery unavailable.');
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it('AC03 logs only the status and short provider code of a refusal, for the operator', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refuse = (body: string) => new BrevoMailSender(settings, vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 401 }))).send(message);
    await expect(refuse('{"code":"unauthorized","message":"Key stub-key not found for user@example.test"}')).rejects.toThrow('Mail delivery unavailable.');
    await expect(refuse('{"code":"user@example.test stub-key"}')).rejects.toThrow();
    await expect(refuse('not json')).rejects.toThrow();
    expect(warn.mock.calls).toEqual([
      ['Mail provider refused', { errorClass: 'MailRefused', errorCode: 'unauthorized', status: 401 }],
      ['Mail provider refused', { errorClass: 'MailRefused', status: 401 }],
      ['Mail provider refused', { errorClass: 'MailRefused', errorCode: 'unknown', status: 401 }],
    ]);
  });
  it('AC03 logs only the error kind when the provider cannot be reached', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = Object.assign(new Error('stub-key and private reset token'), { name: 'TimeoutError' });
    await expect(new BrevoMailSender(settings, vi.fn<typeof fetch>().mockRejectedValue(failure)).send(message)).rejects.toThrow('Mail delivery unavailable.');
    expect(warn.mock.calls).toEqual([['Mail provider unreachable', { errorClass: 'TimeoutError' }]]);
  });
  it.each(['test', 'development'])('AC02 uses local recording even with credentials in %s', async mode => {
    vi.stubEnv('NODE_ENV', mode);
    expect(createMailSender(settings)).toBeInstanceOf(LocalMailSender);
  });
  it('AC02 records a snapshot and prints the complete deliberate local mail display', async () => {
    const output = vi.fn(); const sender = new LocalMailSender(output);
    const mail = { ...message, text: 'https://example.test/reset-password#token=local-test-token' };
    await sender.send(mail); mail.text = 'Changed';
    expect(sender.messages[0].text).toContain('#token=local-test-token');
    expect(output).toHaveBeenCalledWith(expect.stringContaining('#token=local-test-token'));
  });
  it('AC03 never prints or records from a local sender used in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); const output = vi.fn(); const sender = new LocalMailSender(output);
    await expect(sender.send(message)).rejects.toThrow(); expect(sender.available).toBe(false);
    expect(output).not.toHaveBeenCalled(); expect(sender.messages).toEqual([]);
  });
  it('AC04 selects configured Brevo only in production and fails closed with incomplete settings', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(createMailSender(settings)).toBeInstanceOf(BrevoMailSender);
    for (const partial of [{}, { ...settings, BREVO_API_KEY: undefined }, { ...settings, MAIL_FROM_ADDRESS: undefined }, { ...settings, APP_PUBLIC_URL: undefined }]) {
      expect(createMailSender(partial).available).toBe(false);
      expect(createMailSender(partial).provider).toBe('brevo');
    }
  });
});
