import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  appConfig: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../server/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../server/security.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../server/security.js')>(),
  hashPassword: vi.fn().mockResolvedValue('hash'),
  verifyPassword: vi.fn().mockResolvedValue(false),
  synchronizePasswordHash: vi.fn().mockResolvedValue('hash'),
}));

describe('login rate limiting', () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = 'configured password';
    prismaMock.appConfig.findUnique.mockReset().mockResolvedValue(null);
    prismaMock.appConfig.create.mockReset().mockImplementation(({ data }) => Promise.resolve(data));
    prismaMock.appConfig.update.mockReset();
  });

  it('allows twelve failed attempts before returning a clear retry message', async () => {
    const { app } = await import('../server/app.js');
    const client = request(app);

    for (let attempt = 0; attempt < 12; attempt++) {
      await expect(client.post('/api/auth/login').send({ password: 'incorrect' })).resolves.toMatchObject({ status: 401 });
    }

    const blocked = await client.post('/api/auth/login').send({ password: 'incorrect' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/try again/i);
  });
});
