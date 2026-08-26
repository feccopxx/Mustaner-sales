export type AlertEvent = { idempotencyKey: string; type: string; summary: string; payload: Record<string, unknown> };
export type AlertSender = (url: string, event: AlertEvent) => Promise<void>;

const defaultSender: AlertSender = async (url, event) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': event.idempotencyKey }, body: JSON.stringify({ source: 'mustaner-sales-agent', ...event }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Human alert failed (${response.status})`);
};

export async function dispatchHumanAlert(event: AlertEvent, url: string, send: AlertSender = defaultSender): Promise<void> {
  if (!url.trim()) throw new Error('Human notification URL is required');
  await send(url.trim(), event);
}

export async function dispatchHumanAlerts(event: AlertEvent, urls: string[], send: AlertSender = defaultSender): Promise<void> {
  const channels = [...new Set(urls.map(url => url.trim()).filter(Boolean))];
  if (channels.length < 2) throw new Error('At least two human notification channels must be configured');
  await Promise.all(channels.map(url => dispatchHumanAlert(event, url, send)));
}
