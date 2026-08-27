import argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export async function synchronizePasswordHash(storedHash: string, configuredPassword: string) {
  return (await verifyPassword(storedHash, configuredPassword)) ? storedHash : hashPassword(configuredPassword);
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function createApiKey() {
  const plaintext = `mstr_${randomBytes(32).toString('base64url')}`;
  return { plaintext, prefix: plaintext.slice(0, 12), hash: digest(plaintext).toString('hex') };
}

export function verifyApiKey(plaintext: string, expectedHex: string) {
  const actual = digest(plaintext);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyConfiguredApiKey(plaintext: string, configuredKey: string) {
  if (!plaintext || !configuredKey) return false;
  const actual = digest(plaintext);
  const expected = digest(configuredKey);
  return timingSafeEqual(actual, expected);
}
