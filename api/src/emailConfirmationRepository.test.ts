import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailConfirmationRepository, InMemoryEmailConfirmationRepository, MongoEmailConfirmationRepository } from './emailConfirmationRepository.js';
import { fakeAccountMailTokenCollection } from '../test/fakeAccountMailTokenCollection.js';
import * as config from './config.js';
import { getMongoDatabase } from './mongo.js';
import { sendEmailConfirmationLink } from './emailConfirmationDelivery.js';
import { LocalMailSender } from './mailSender.js';

vi.mock('./mongo.js', () => ({ getMongoDatabase: vi.fn(async () => { throw new Error('No real MongoDB'); }) }));
afterEach(() => vi.restoreAllMocks());
const hour = 3600000, day = 24 * hour;

describe.each(['memory', 'mongo'])('US-L014 confirmation token and mail storage (%s)', kind => {
  function setup() {
    const fake = fakeAccountMailTokenCollection(), memory = new InMemoryEmailConfirmationRepository();
    const one = kind === 'memory' ? memory : new MongoEmailConfirmationRepository(async () => fake.collection);
    const two = kind === 'memory' ? memory : new MongoEmailConfirmationRepository(async () => fake.collection);
    return { one, two, fake };
  }
  it('AC02 reserves exactly three concurrent mail slots across instances and frees slots after an hour', async () => {
    const { one, two } = setup();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? one : two).reserve('user', `hash-${i}`, 1000)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await one.mailRetryAfter('user', 1000)).toBe(3600);
    expect(await one.mailRetryAfter('user', 3600999)).toBe(1);
    expect(await one.reserve('user', 'new-hour', 3601000)).toBe(true);
    expect(await two.reserve('another', 'another-user', 1000)).toBe(true);
  });
  it('AC01 links last 24 hours and survive later reservations after their mail slot expires', async () => {
    const { one, two } = setup();
    await one.reserve('user', 'old-link', 0); await one.activate('user', 'old-link');
    await two.reserve('user', 'later-link', 2 * hour); await two.activate('user', 'later-link');
    expect(await one.findActive('old-link', day - 1)).toEqual({ userId: 'user', hash: 'old-link' });
    expect(await one.findActive('old-link', day)).toBeNull();
    expect(await one.findActive('later-link', day)).toEqual({ userId: 'user', hash: 'later-link' });
  });
  it('AC01 consumes one link atomically and cancels siblings and in-flight activations', async () => {
    const { one, two } = setup();
    for (const hash of ['one', 'two', 'pending']) await one.reserve('user', hash, 1000);
    for (const hash of ['one', 'two']) await one.activate('user', hash);
    const results = await Promise.all([one.consume('one', 1000), two.consume('two', 1000)]);
    expect(results.filter(Boolean)).toEqual(['user']);
    expect(await one.consume('one', 1000)).toBeNull();
    expect(await two.activate('user', 'pending')).toBe(false);
    expect(await one.reserve('user', 'fourth', 1000)).toBe(false);
  });
  it('AC02 parallel sends through separate adapters never deliver more than three messages', async () => {
    const { one, two, fake } = setup();
    const mail = new LocalMailSender(() => {});
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => sendEmailConfirmationLink({ id: 'user', email: 'user@example.test' },
      { tokens: i % 2 ? one : two, sender: mail, options: { now: () => 1000, appPublicUrl: 'https://example.test' } })));
    expect(results.filter(result => result === 'sent')).toHaveLength(3);
    expect(mail.messages).toHaveLength(3);
    if (kind === 'mongo') {
      const document = fake.documents.get('user')!;
      expect(document.tokens).toHaveLength(3);
      expect(document.tokens.every(token => /^[a-f0-9]{64}$/.test(token.hash) && token.expiresAt === 1000 + day)).toBe(true);
      for (const message of mail.messages) {
        const raw = message.text.match(/#token=([A-Za-z0-9_-]+)/)![1];
        expect(JSON.stringify(document)).not.toContain(raw);
      }
      expect(JSON.stringify(document)).not.toContain('user@example.test');
    }
  });
});

describe('US-L014 confirmation storage selection', () => {
  it.each(['isolated', 'shared', 'hosted'] as const)('uses only isolated memory or configured Mongo in %s mode', async mode => {
    vi.spyOn(config, 'getServicesMode').mockReturnValue(mode);
    const mongo = vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createEmailConfirmationRepository()).toBeInstanceOf(mode === 'isolated' ? InMemoryEmailConfirmationRepository : MongoEmailConfirmationRepository);
    mongo.mockReturnValue(false);
    if (mode !== 'isolated') await expect(createEmailConfirmationRepository().reserve('user', 'hash', 0)).rejects.toThrow('unavailable');
  });
  it('keeps confirmation hashes in the dedicated Mongo collection', async () => {
    const fake = fakeAccountMailTokenCollection(), collection = vi.fn(() => fake.collection);
    const previous = config.apiConfig.MONGODB_COURSE_CONTENT_COLLECTION;
    config.apiConfig.MONGODB_COURSE_CONTENT_COLLECTION = 'synthetic_content';
    vi.mocked(getMongoDatabase).mockResolvedValueOnce({ collection } as never);
    try {
      await new MongoEmailConfirmationRepository().reserve('user', 'a'.repeat(64), 0);
      expect(collection).toHaveBeenCalledWith('synthetic_content_email_confirmations');
      expect(fake.documents.get('user')?.tokens[0].expiresAt).toBe(day);
    } finally { config.apiConfig.MONGODB_COURSE_CONTENT_COLLECTION = previous; }
  });
});
