import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  apiKey: { findMany: vi.fn(), update: vi.fn() },
  agentConversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  agentMessage: { findUnique: vi.fn(), create: vi.fn() },
  agentMessageBatch: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  agentFollowUp: { updateMany: vi.fn(), upsert: vi.fn() },
  agentHandoffEvent: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $executeRaw: vi.fn(), $transaction: vi.fn(),
};
const syncLeadToOdoo = vi.fn();
const dispatchHumanAlert = vi.fn();
const sendMessengerText = vi.fn();

vi.mock('../server/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../server/security.js', async importOriginal => ({ ...await importOriginal<typeof import('../server/security.js')>(), verifyApiKey: vi.fn().mockReturnValue(true) }));
vi.mock('../server/integrations/odoo.js', () => ({ syncLeadToOdoo }));
vi.mock('../server/integrations/notifications.js', () => ({ dispatchHumanAlert }));
vi.mock('../server/integrations/messenger.js', async importOriginal => ({ ...await importOriginal<typeof import('../server/integrations/messenger.js')>(), sendMessengerText }));

describe('integration API', () => {
  beforeEach(() => {
    process.env.MESSENGER_VERIFY_TOKEN = 'verify-me'; process.env.MESSENGER_APP_SECRET = 'app-secret';
    process.env.MESSENGER_PAGE_ACCESS_TOKEN = 'page-token';
    process.env.ODOO_URL = 'https://odoo.example'; process.env.ODOO_DATABASE = 'mustaner'; process.env.ODOO_USERNAME = 'agent'; process.env.ODOO_API_KEY = 'key';
    process.env.HUMAN_NOTIFICATION_WEBHOOK_URLS = 'https://one.example,https://two.example';
    prismaMock.apiKey.findMany.mockResolvedValue([{ id: 'key', keyHash: 'hash', scopes: ['agent:write'] }]); prismaMock.apiKey.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async callback => callback(prismaMock)); prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.agentConversation.findUnique.mockResolvedValue(null); prismaMock.agentConversation.create.mockResolvedValue({ id: 'conversation-1' }); prismaMock.agentConversation.update.mockResolvedValue({ id: 'conversation-1' });
    prismaMock.agentMessage.findUnique.mockResolvedValue(null); prismaMock.agentMessage.create.mockResolvedValue({ id: 'message-1' });
    prismaMock.agentMessageBatch.findFirst.mockResolvedValue(null); prismaMock.agentMessageBatch.create.mockResolvedValue({ id: 'batch-1', flushAt: new Date(Date.now() + 15_000) }); prismaMock.agentMessageBatch.update.mockResolvedValue({});
    prismaMock.agentMessageBatch.findUnique.mockReset(); prismaMock.agentMessageBatch.updateMany.mockReset();
    prismaMock.agentFollowUp.updateMany.mockResolvedValue({ count: 0 }); prismaMock.agentFollowUp.upsert.mockResolvedValue({});
    sendMessengerText.mockReset().mockResolvedValue(undefined);
    syncLeadToOdoo.mockReset().mockResolvedValue(42); dispatchHumanAlert.mockReset().mockResolvedValue(undefined);
    prismaMock.agentHandoffEvent.update.mockReset().mockResolvedValue({}); prismaMock.agentHandoffEvent.findMany.mockReset().mockResolvedValue([]);
  });

  it('completes Meta webhook verification', async () => {
    const { app } = await import('../server/app.js');
    const response = await request(app).get('/api/v1/integrations/messenger/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1234');
    expect(response.status).toBe(200); expect(response.text).toBe('1234');
  });

  it('accepts a signed Messenger text event into the debounce pipeline', async () => {
    const body = { object: 'page', entry: [{ messaging: [{ sender: { id: 'lead-1' }, timestamp: Date.now(), message: { mid: 'm-1', text: 'Hello' } }] }] };
    const raw = JSON.stringify(body); const signature = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/integrations/messenger/webhook').set('x-hub-signature-256', signature).set('content-type', 'application/json').send(raw);
    expect(response.status).toBe(200); expect(prismaMock.agentMessage.create).toHaveBeenCalled();
  });

  it('dispatches a handoff to Odoo and two human channels once', async () => {
    prismaMock.agentHandoffEvent.findUnique.mockResolvedValue({ id: 'event-1', idempotencyKey: 'event-1', type: 'AI_AUTOMATION_LEAD', deliveredAt: null, dispatchStatus: 'PENDING', deliveryState: {}, payload: { summary: 'Qualified lead', phone: '0100' } });
    prismaMock.agentHandoffEvent.updateMany.mockResolvedValue({ count: 1 });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/handoffs/event-1/dispatch').set('X-API-Key', 'mstr_test');
    expect(response.status).toBe(200); expect(response.body).toMatchObject({ odooLeadId: 42 });
    expect(dispatchHumanAlert).toHaveBeenCalledTimes(2);
  });

  it('delivers a ready batch through Messenger', async () => {
    prismaMock.agentMessageBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'READY_TO_SEND', responseText: 'أهلاً يا فندم', conversationId: 'conversation-1', conversation: { channel: 'MESSENGER', customerId: 'lead-1', lastInboundAt: new Date('2026-08-26T12:00:00Z'), lastInboundSequence: 1 }, messages: [{ receivedAt: new Date('2026-08-26T12:00:00Z'), sequence: 1 }] });
    prismaMock.agentMessageBatch.updateMany.mockResolvedValue({ count: 1 });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/batches/batch-1/send').set('X-API-Key', 'mstr_test');
    expect(response.status).toBe(200); expect(sendMessengerText).toHaveBeenCalledWith('lead-1', 'أهلاً يا فندم', 'page-token');
  });

  it('does not deliver a reply after newer customer input arrives', async () => {
    prismaMock.agentMessageBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'READY_TO_SEND', responseText: 'old reply', conversationId: 'conversation-1', conversation: { channel: 'MESSENGER', customerId: 'lead-1', lastInboundAt: new Date('2026-08-26T12:00:00Z'), lastInboundSequence: 2 }, messages: [{ receivedAt: new Date('2026-08-26T12:00:00Z'), sequence: 1 }] });
    prismaMock.agentMessageBatch.updateMany.mockResolvedValue({ count: 1 });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/batches/batch-1/send').set('X-API-Key', 'mstr_test');
    expect(response.status).toBe(409); expect(sendMessengerText).not.toHaveBeenCalled();
  });

  it('allows an ambiguous Messenger delivery to be confirmed not sent', async () => {
    prismaMock.agentMessageBatch.updateMany.mockResolvedValue({ count: 1 });
    const { app } = await import('../server/app.js');
    const response = await request(app).post('/api/v1/agent/batches/batch-1/reconcile-delivery').set('X-API-Key', 'mstr_test').send({ action: 'CONFIRM_NOT_SENT' });
    expect(response.status).toBe(200); expect(response.body).toEqual({ status: 'PENDING' });
  });
});
