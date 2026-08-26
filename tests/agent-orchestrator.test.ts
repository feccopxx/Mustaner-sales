import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  agentMessageBatch: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  agentConfigurationVersion: { findFirst: vi.fn() },
  course: { findMany: vi.fn() },
  agentFollowUp: { upsert: vi.fn() },
  $executeRaw: vi.fn(), $transaction: vi.fn(),
};
const generateSalesReply = vi.fn();
const createSalesAiClient = vi.fn();
const sendMessengerText = vi.fn();

vi.mock('../server/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../server/agent/runtime.js', () => ({ generateSalesReply, createSalesAiClient }));
vi.mock('../server/integrations/messenger.js', async importOriginal => ({ ...await importOriginal<typeof import('../server/integrations/messenger.js')>(), sendMessengerText }));

describe('agent batch orchestrator', () => {
  beforeEach(() => {
    process.env.OPEN_AI_API_KEY = 'openai-key';
    prismaMock.$transaction.mockReset().mockImplementation(async callback => callback(prismaMock));
    prismaMock.$executeRaw.mockReset().mockResolvedValue(0);
    prismaMock.agentMessageBatch.findFirst.mockReset().mockResolvedValueOnce({ id: 'batch-1', conversation: { channel: 'MESSENGER', customerId: 'lead-1' } }).mockResolvedValue(null);
    prismaMock.agentMessageBatch.findUnique.mockReset().mockResolvedValue({ id: 'batch-1', status: 'OPEN', flushAt: new Date(Date.now() - 1), conversationId: 'conversation-1', conversation: { state: {}, lastInboundSequence: 1 }, messages: [{ id: 'message-1', normalizedText: 'عايز أعرف سعر الكورس', occurredAt: new Date('2026-08-26T10:00:00Z'), receivedAt: new Date('2026-08-26T10:00:00Z'), sequence: 1 }] });
    prismaMock.agentMessageBatch.update.mockReset().mockResolvedValue({});
    prismaMock.agentMessageBatch.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prismaMock.agentConfigurationVersion.findFirst.mockReset().mockResolvedValue({ version: 2, persona: 'Mustaner voice' });
    prismaMock.course.findMany.mockReset().mockResolvedValue([]);
    generateSalesReply.mockReset().mockResolvedValue('أهلاً يا فندم، أقدر أساعد حضرتك.');
    createSalesAiClient.mockReset().mockReturnValue({});
    sendMessengerText.mockReset().mockResolvedValue(undefined);
    prismaMock.agentFollowUp.upsert.mockReset().mockResolvedValue({});
  });

  it('claims a due batch and persists one generated reply automatically', async () => {
    const { processPendingAgentBatches } = await import('../server/app.js');
    await expect(processPendingAgentBatches()).resolves.toBe(1);
    expect(generateSalesReply).toHaveBeenCalledWith(expect.objectContaining({ customerInput: 'عايز أعرف سعر الكورس', configurationVersion: 2 }), expect.anything());
    expect(prismaMock.agentMessageBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY_TO_SEND' }) }));
  });

  it('delivers a generated Messenger reply without an external API caller', async () => {
    process.env.MESSENGER_PAGE_ACCESS_TOKEN = 'page-token';
    prismaMock.agentMessageBatch.findFirst.mockReset().mockResolvedValueOnce({ id: 'batch-1', conversation: { channel: 'MESSENGER', customerId: 'lead-1' } }).mockResolvedValue(null);
    prismaMock.agentMessageBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'READY_TO_SEND', responseText: 'أهلاً يا فندم', deliveryStatus: 'PENDING', conversationId: 'conversation-1', conversation: { channel: 'MESSENGER', customerId: 'lead-1', lastInboundAt: new Date('2026-08-26T10:00:00Z'), lastInboundSequence: 1 }, messages: [{ receivedAt: new Date('2026-08-26T10:00:00Z'), sequence: 1 }] });
    const { processPendingMessengerDeliveries } = await import('../server/app.js');
    await expect(processPendingMessengerDeliveries()).resolves.toBe(1);
    expect(sendMessengerText).toHaveBeenCalledWith('lead-1', 'أهلاً يا فندم', 'page-token');
  });
});
