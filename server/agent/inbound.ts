export const DEBOUNCE_MS = 15_000;

export type InboundKind = 'TEXT' | 'VOICE' | 'IMAGE' | 'PDF' | 'DOCX' | 'VIDEO' | 'OTHER';

export interface InboundMessage {
  id: string;
  kind: InboundKind;
  text: string;
  occurredAt: Date;
}

export function nextBatchFlushAt(latestMessageAt: Date): Date {
  return new Date(latestMessageAt.getTime() + DEBOUNCE_MS);
}

export function normalizeInboundMessage(message: InboundMessage): string {
  const text = message.text.trim();
  if (message.kind === 'TEXT' || message.kind === 'VOICE') return text;
  const summary = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 5).join('\n');
  return `User sent a ${message.kind} with these details:\n${summary}`;
}

export function combineInboundBatch(messages: InboundMessage[]): string {
  return [...messages]
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
    .map(normalizeInboundMessage)
    .filter(Boolean)
    .join('\n');
}
