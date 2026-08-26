import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  apiKey: { findMany: vi.fn(), update: vi.fn() },
  agentConfigurationVersion: { findFirst: vi.fn(), findUnique: vi.fn() },
  course: { findFirst: vi.fn() },
  meetingReservation: { create: vi.fn() },
  agentHandoffEvent: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('../server/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../server/security.js', async importOriginal => ({
  ...await importOriginal<typeof import('../server/security.js')>(),
  verifyApiKey: vi.fn().mockReturnValue(true),
}));
vi.mock('../server/agent/runtime.js', () => ({
  generateSalesReply: vi.fn().mockResolvedValue('أهلاً يا فندم، أقدر أساعد حضرتك.'),
  createSalesAiClient: vi.fn().mockReturnValue({}),
}));

describe('sales agent API', () => {
  beforeEach(() => {
    process.env.OPEN_AI_API_KEY = 'test-openai-key';
    prismaMock.apiKey.findMany.mockReset().mockResolvedValue([{ id: 'key-1', keyHash: 'hash', scopes: ['courses:read', 'agent:read', 'agent:write'] }]);
    prismaMock.apiKey.update.mockReset().mockResolvedValue({});
    prismaMock.agentConfigurationVersion.findFirst.mockReset();
    prismaMock.agentConfigurationVersion.findUnique.mockReset().mockResolvedValue({ id: 'config-2', version: 2 });
    prismaMock.course.findFirst.mockReset();
    prismaMock.meetingReservation.create.mockReset();
    prismaMock.agentHandoffEvent.findUnique.mockReset();
    prismaMock.agentHandoffEvent.create.mockReset();
    prismaMock.$transaction.mockReset().mockImplementation(async callback => callback(prismaMock));
  });

  it('returns only the latest published agent configuration', async () => {
    prismaMock.agentConfigurationVersion.findFirst.mockResolvedValue({ id: 'config-2', version: 2, persona: 'Mustaner voice', publishedAt: new Date('2026-08-26T10:00:00Z') });
    const { app } = await import('../server/app.js');
    const response = await request(app).get('/api/v1/agent/config').set('X-API-Key', 'mstr_test');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ version: 2, persona: 'Mustaner voice' });
  });

  it('atomically creates a valid meeting reservation', async () => {
    prismaMock.meetingReservation.create.mockImplementation(async ({ data }) => ({ id: 'meeting-1', ...data }));
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/meetings').set('X-API-Key', 'mstr_test').send({
      customerId: 'lead-1', customerName: 'Ahmed', phone: '01000000000', mode: 'ONLINE', platform: 'ZOOM',
      startsAt: '2026-08-30T14:00:00.000Z', now: '2026-08-29T09:00:00.000Z',
      sourceChannel: 'MESSENGER', configurationVersion: 2, summary: 'Qualified automation lead requested an online meeting.',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'CONFIRMED', reservation: { id: 'meeting-1' } });
  });

  it('returns the same handoff event for an idempotent retry', async () => {
    prismaMock.agentHandoffEvent.findUnique.mockResolvedValue({ id: 'event-1', idempotencyKey: 'conv-1:consultation', type: 'CONSULTATION_REQUEST', payload: {} });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/handoffs').set('X-API-Key', 'mstr_test').send({
      type: 'CONSULTATION_REQUEST', idempotencyKey: 'conv-1:consultation', payload: { phone: '01200000000', reason: 'Business consultation', sourceChannel: 'MESSENGER', summary: 'Customer requested a consultation.', configurationVersion: 2 },
    });
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('event-1');
    expect(prismaMock.agentHandoffEvent.create).not.toHaveBeenCalled();
  });

  it('generates one reply from the published persona and debounced customer input', async () => {
    prismaMock.agentConfigurationVersion.findFirst.mockResolvedValue({ id: 'config-2', version: 2, persona: 'Mustaner voice', publishedAt: new Date() });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/respond').set('X-API-Key', 'mstr_test').send({
      customerInput: 'السلام عليكم\nممكن اعرف سعر الكورس كام؟',
      conversationState: { service: 'COURSE' },
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'أهلاً يا فندم، أقدر أساعد حضرتك.', configurationVersion: 2 });
  });

  it('rejects model access from a course-only API key', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([{ id: 'key-1', keyHash: 'hash', scopes: ['courses:read'] }]);
    const { app } = await import('../server/app.js');
    const response = await request(app).get('/api/v1/agent/config').set('X-API-Key', 'mstr_test');
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/agent:read/);
  });
});
