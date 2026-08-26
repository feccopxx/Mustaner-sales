import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  apiKey: { findMany: vi.fn(), update: vi.fn() },
  agentConfigurationVersion: { findFirst: vi.fn(), findUnique: vi.fn() },
  course: { findFirst: vi.fn() },
  meetingReservation: { create: vi.fn() },
  agentHandoffEvent: { findUnique: vi.fn(), create: vi.fn() },
  agentConversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  agentMessage: { findUnique: vi.fn(), create: vi.fn() },
  agentMessageBatch: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  agentFollowUp: { updateMany: vi.fn(), upsert: vi.fn() },
  $executeRaw: vi.fn(),
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
    prismaMock.$executeRaw.mockReset().mockResolvedValue(0);
    prismaMock.agentConversation.findUnique.mockReset().mockResolvedValue({ id: 'conversation-1', channel: 'MESSENGER', customerId: 'customer-1' });
    prismaMock.agentConversation.create.mockReset().mockResolvedValue({ id: 'conversation-1', channel: 'MESSENGER', customerId: 'customer-1' });
    prismaMock.agentConversation.update.mockReset().mockResolvedValue({ id: 'conversation-1', channel: 'MESSENGER', customerId: 'customer-1' });
    prismaMock.agentMessage.findUnique.mockReset().mockResolvedValue(null);
    prismaMock.agentMessage.create.mockReset().mockResolvedValue({ id: 'message-1' });
    prismaMock.agentMessageBatch.findFirst.mockReset();
    prismaMock.agentMessageBatch.findUnique.mockReset();
    prismaMock.agentMessageBatch.create.mockReset();
    prismaMock.agentMessageBatch.update.mockReset();
    prismaMock.agentMessageBatch.updateMany.mockReset();
    prismaMock.agentFollowUp.updateMany.mockReset().mockResolvedValue({ count: 0 });
    prismaMock.agentFollowUp.upsert.mockReset().mockResolvedValue({});
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
    prismaMock.agentMessageBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'PROCESSING', combinedInput: 'السلام عليكم\nممكن اعرف سعر الكورس كام؟', responseText: '', configurationVersion: null, conversation: { state: { service: 'COURSE' } } });
    prismaMock.agentMessageBatch.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentMessageBatch.update.mockResolvedValue({});
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/respond').set('X-API-Key', 'mstr_test').send({
      batchId: 'batch-1',
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'أهلاً يا فندم، أقدر أساعد حضرتك.', configurationVersion: 2 });
  });

  it('reuses a stored batch response without invoking the model twice', async () => {
    prismaMock.agentMessageBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'READY_TO_SEND', combinedInput: 'hello', responseText: 'stored reply', configurationVersion: 2, conversation: { state: {} } });
    const runtime = await import('../server/agent/runtime.js');
    vi.mocked(runtime.generateSalesReply).mockClear();
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/respond').set('X-API-Key', 'mstr_test').send({ batchId: 'batch-1' });
    expect(response.body).toEqual({ reply: 'stored reply', configurationVersion: 2 });
    expect(runtime.generateSalesReply).not.toHaveBeenCalled();
  });

  it('marks a stored response delivered exactly once', async () => {
    prismaMock.agentMessageBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'READY_TO_SEND', conversationId: 'conversation-1', conversation: { channel: 'MESSENGER', customerId: 'customer-1', lastInboundAt: new Date('2026-08-26T12:00:00Z'), lastInboundSequence: 1 }, messages: [{ receivedAt: new Date('2026-08-26T12:00:00Z'), sequence: 1 }] });
    prismaMock.agentMessageBatch.updateMany.mockResolvedValue({ count: 1 });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/batches/batch-1/delivered').set('X-API-Key', 'mstr_test');
    expect(response.status).toBe(204);
    expect(prismaMock.agentFollowUp.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects model access from a course-only API key', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([{ id: 'key-1', keyHash: 'hash', scopes: ['courses:read'] }]);
    const { app } = await import('../server/app.js');
    const response = await request(app).get('/api/v1/agent/config').set('X-API-Key', 'mstr_test');
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/agent:read/);
  });

  it('persists a message and resets its customer batch to a 15-second trailing flush', async () => {
    prismaMock.agentMessageBatch.findFirst.mockResolvedValue({ id: 'batch-1', status: 'OPEN' });
    prismaMock.agentMessageBatch.update.mockResolvedValue({ id: 'batch-1', flushAt: new Date('2026-08-26T12:00:17Z') });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/messages').set('X-API-Key', 'mstr_test').send({
      channel: 'MESSENGER', customerId: 'customer-1', sourceMessageId: 'message-1', kind: 'TEXT', text: 'السلام عليكم', occurredAt: '2026-08-26T12:00:02Z', receivedAt: '2026-08-26T12:00:02Z',
    });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: 'BUFFERED', batchId: 'batch-1', flushAt: '2026-08-26T12:00:17.000Z' });
    expect(prismaMock.agentFollowUp.updateMany).toHaveBeenCalled();
  });

  it('atomically claims one due batch and returns one chronological combined input', async () => {
    prismaMock.agentMessageBatch.findFirst.mockResolvedValue({ id: 'batch-1', conversation: { channel: 'MESSENGER', customerId: 'customer-1' } });
    prismaMock.agentMessageBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'OPEN', flushAt: new Date('2026-08-26T12:00:15Z'), messages: [
      { id: 'message-2', normalizedText: 'حيبدأ امتى؟', occurredAt: new Date('2026-08-26T12:00:03Z'), receivedAt: new Date('2026-08-26T12:00:04Z') },
      { id: 'message-1', normalizedText: 'السلام عليكم', occurredAt: new Date('2026-08-26T12:00:01Z'), receivedAt: new Date('2026-08-26T12:00:02Z') },
    ] });
    prismaMock.agentMessageBatch.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentMessageBatch.update.mockResolvedValue({});
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/batches/claim').set('X-API-Key', 'mstr_test').send({ now: '2026-08-26T12:00:20Z' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ batchId: 'batch-1', customerInput: 'السلام عليكم\nحيبدأ امتى؟' });
  });
});
