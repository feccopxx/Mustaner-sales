import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { classifyMessengerMedia, downloadMessengerMedia, parseMessengerWebhook, verifyMessengerSignature } from '../server/integrations/messenger.js';
import { extractMediaMessage } from '../server/integrations/media.js';
import { dispatchHumanAlerts } from '../server/integrations/notifications.js';
import { syncLeadToOdoo } from '../server/integrations/odoo.js';

describe('Messenger adapter', () => {
  it('turns text and attachments into stable inbound envelopes', () => {
    const messages = parseMessengerWebhook({ entry: [{ messaging: [{ sender: { id: 'lead-1' }, timestamp: 1_788_000_000_000, message: { mid: 'm-1', text: 'السلام عليكم' } }, { sender: { id: 'lead-1' }, timestamp: 1_788_000_001_000, message: { mid: 'm-2', attachments: [{ type: 'image', payload: { url: 'https://cdn.example/image.jpg' } }] } }] }] });
    expect(messages).toEqual([
      expect.objectContaining({ customerId: 'lead-1', sourceMessageId: 'm-1', kind: 'TEXT', text: 'السلام عليكم' }),
      expect.objectContaining({ customerId: 'lead-1', sourceMessageId: 'm-2:0', kind: 'IMAGE', mediaUrl: 'https://cdn.example/image.jpg' }),
    ]);
  });

  it('verifies the raw Meta webhook body signature', () => {
    const body = Buffer.from('{"object":"page"}');
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifyMessengerSignature(body, signature, 'secret')).toBe(true);
    expect(verifyMessengerSignature(body, 'sha256=bad', 'secret')).toBe(false);
  });

  it('rejects attachment downloads outside Meta CDN hosts', async () => {
    await expect(downloadMessengerMedia('https://internal.example/file.pdf', vi.fn() as never)).rejects.toThrow(/host/i);
  });

  it('classifies opaque attachment URLs from their downloaded MIME type', () => {
    expect(classifyMessengerMedia('OTHER', 'application/pdf', 'attachment')).toBe('PDF');
    expect(classifyMessengerMedia('OTHER', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'attachment')).toBe('DOCX');
  });
});

describe('OpenAI media normalization', () => {
  it('relays voice transcription as plain text', async () => {
    const text = await extractMediaMessage({ kind: 'VOICE', buffer: Buffer.from('audio'), filename: 'note.ogg', mimeType: 'audio/ogg' }, { transcribe: vi.fn().mockResolvedValue('محتاج أعمل أتمتة للمبيعات'), summarize: vi.fn() });
    expect(text).toBe('محتاج أعمل أتمتة للمبيعات');
  });

  it('prefixes documents with a concise maximum-five-line summary', async () => {
    const text = await extractMediaMessage({ kind: 'PDF', buffer: Buffer.from('pdf'), filename: 'brief.pdf', mimeType: 'application/pdf' }, { transcribe: vi.fn(), summarize: vi.fn().mockResolvedValue('نظام لإدارة العملاء\nيتضمن تكامل واتساب\nالميزانية المقترحة 30000 جنيه\nموعد التنفيذ شهر') });
    expect(text.split('\n')).toHaveLength(5);
    expect(text).toMatch(/^User sent a PDF with these details:/);
  });
});

describe('qualified lead integrations', () => {
  it('requires and sends alerts to at least two channels', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await dispatchHumanAlerts({ idempotencyKey: 'event-1', type: 'AI_AUTOMATION_LEAD', summary: 'Qualified lead', payload: { phone: '0100' } }, ['https://one.example', 'https://two.example'], send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('creates an Odoo CRM lead using JSON-RPC', async () => {
    const rpc = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce([]).mockResolvedValueOnce(42);
    const id = await syncLeadToOdoo({ idempotencyKey: 'event-1', type: 'CONSULTATION_REQUEST', summary: 'Needs consultation', payload: { phone: '0100', name: 'Ahmed' } }, { url: 'https://odoo.example', database: 'mustaner', username: 'agent', apiKey: 'key' }, rpc);
    expect(id).toBe(42);
    expect(rpc).toHaveBeenLastCalledWith(expect.objectContaining({ service: 'object', method: 'execute_kw' }));
  });

  it('reuses the Odoo lead matching the handoff idempotency marker', async () => {
    const rpc = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce([{ id: 42 }]);
    const id = await syncLeadToOdoo({ idempotencyKey: 'event-1', type: 'AI_AUTOMATION_LEAD', summary: 'Qualified', payload: {} }, { url: 'https://odoo.example', database: 'mustaner', username: 'agent', apiKey: 'key' }, rpc);
    expect(id).toBe(42); expect(rpc).toHaveBeenCalledTimes(2);
  });
});
