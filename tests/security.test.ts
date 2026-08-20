import { describe, expect, it } from 'vitest';
import { createApiKey, hashPassword, verifyApiKey, verifyPassword } from '../server/security.js';

describe('security primitives', () => {
  it('hashes and verifies the app password with Argon2id', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('creates a one-time plaintext API key and stores a SHA-256 hash', () => {
    const key = createApiKey();
    expect(key.plaintext).toMatch(/^mstr_[A-Za-z0-9_-]+$/);
    expect(key.hash).not.toContain(key.plaintext);
    expect(verifyApiKey(key.plaintext, key.hash)).toBe(true);
    expect(verifyApiKey('mstr_wrong', key.hash)).toBe(false);
  });
});
