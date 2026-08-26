import { createHmac, timingSafeEqual } from 'node:crypto';

export type MessengerInbound = {
  channel: 'MESSENGER'; customerId: string; sourceMessageId: string;
  kind: 'TEXT' | 'VOICE' | 'IMAGE' | 'PDF' | 'DOCX' | 'VIDEO' | 'OTHER';
  text: string; mediaUrl?: string; occurredAt: string;
};

export function classifyMessengerMedia(current: MessengerInbound['kind'], mimeType: string, filename: string): MessengerInbound['kind'] {
  if (current !== 'OTHER') return current;
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'VOICE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(filename)) return 'PDF';
  if (mimeType.includes('wordprocessingml') || /\.docx?$/i.test(filename)) return 'DOCX';
  return 'OTHER';
}

const attachmentKind = (type: string, url: string): MessengerInbound['kind'] => {
  if (type === 'image') return 'IMAGE';
  if (type === 'audio') return 'VOICE';
  if (type === 'video') return 'VIDEO';
  if (/\.pdf(?:$|\?)/i.test(url)) return 'PDF';
  if (/\.docx?(?:$|\?)/i.test(url)) return 'DOCX';
  return 'OTHER';
};

export function parseMessengerWebhook(body: unknown): MessengerInbound[] {
  const output: MessengerInbound[] = [];
  const entries = (body as { entry?: Array<{ messaging?: Array<Record<string, unknown>> }> })?.entry || [];
  for (const entry of entries) for (const event of entry.messaging || []) {
    const sender = event.sender as { id?: string } | undefined;
    const message = event.message as { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string; payload?: { url?: string } }> } | undefined;
    if (!sender?.id || !message?.mid || message.is_echo) continue;
    const occurredAt = new Date(typeof event.timestamp === 'number' ? event.timestamp : Date.now()).toISOString();
    if (message.text?.trim()) output.push({ channel: 'MESSENGER', customerId: sender.id, sourceMessageId: message.mid, kind: 'TEXT', text: message.text.trim(), occurredAt });
    for (const [index, attachment] of (message.attachments || []).entries()) {
      const mediaUrl = attachment.payload?.url;
      if (!mediaUrl) continue;
      output.push({ channel: 'MESSENGER', customerId: sender.id, sourceMessageId: `${message.mid}:${index}`, kind: attachmentKind(attachment.type || '', mediaUrl), text: '', mediaUrl, occurredAt });
    }
  }
  return output;
}

export function verifyMessengerSignature(body: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith('sha256=') || !secret) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'));
  const actual = Buffer.from(signature.slice(7));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function downloadMessengerMedia(urlText: string, request: typeof fetch = fetch): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const url = new URL(urlText);
  const allowed = url.protocol === 'https:' && ['facebook.com', 'fbcdn.net', 'fbsbx.com'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  if (!allowed) throw new Error('Messenger media host is not allowed');
  const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Messenger media download failed (${response.status})`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > 25 * 1024 * 1024) throw new Error('Messenger media exceeds 25 MB');
  if (!response.body) throw new Error('Messenger media response was empty');
  const reader = response.body.getReader(); const chunks: Buffer[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 25 * 1024 * 1024) { await reader.cancel(); throw new Error('Messenger media exceeds 25 MB'); }
    chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks, bytes);
  return { buffer, mimeType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream', filename: url.pathname.split('/').pop() || 'attachment' };
}

export async function sendMessengerText(recipientId: string, text: string, pageAccessToken: string, request: typeof fetch = fetch): Promise<void> {
  const response = await request('https://graph.facebook.com/v23.0/me/messages', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${pageAccessToken}` }, body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text } }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Messenger delivery failed (${response.status})`);
}
