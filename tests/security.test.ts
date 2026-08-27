import { describe, expect, it } from 'vitest';
import { createApiKey, hashPassword, synchronizePasswordHash, verifyApiKey, verifyConfiguredApiKey, verifyPassword } from '../server/security.js';

describe('security primitives', () => {
  it('hashes and verifies the app password with Argon2id', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('replaces a persisted bootstrap hash when the configured password changes', async () => {
    const previousHash = await hashPassword('old deployment password');

    const synchronizedHash = await synchronizePasswordHash(previousHash, 'current configured password');

    expect(await verifyPassword(synchronizedHash, 'current configured password')).toBe(true);
    expect(await verifyPassword(synchronizedHash, 'old deployment password')).toBe(false);
  });

  it('creates a one-time plaintext API key and stores a SHA-256 hash', () => {
    const key = createApiKey();
    expect(key.plaintext).toMatch(/^mstr_[A-Za-z0-9_-]+$/);
    expect(key.hash).not.toContain(key.plaintext);
    expect(verifyApiKey(key.plaintext, key.hash)).toBe(true);
    expect(verifyApiKey('mstr_wrong', key.hash)).toBe(false);
  });

  it('verifies the configured agent key without exposing its value', () => {
    expect(verifyConfiguredApiKey('mstr_agent_key', 'mstr_agent_key')).toBe(true);
    expect(verifyConfiguredApiKey('mstr_wrong', 'mstr_agent_key')).toBe(false);
    expect(verifyConfiguredApiKey('', 'mstr_agent_key')).toBe(false);
  });
});
