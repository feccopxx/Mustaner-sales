import { createHash } from 'node:crypto';

export type OdooConfig = { url: string; database: string; username: string; apiKey: string };
export type OdooRpc = (request: { url: string; service: string; method: string; args: unknown[] }) => Promise<unknown>;
export type CrmEvent = { idempotencyKey: string; type: string; summary: string; payload: Record<string, unknown> };

const defaultRpc: OdooRpc = async request => {
  const response = await fetch(`${request.url.replace(/\/$/, '')}/jsonrpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: request.service, method: request.method, args: request.args }, id: Date.now() }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Odoo request failed (${response.status})`);
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'Odoo returned an error');
  return body.result;
};

export async function syncLeadToOdoo(event: CrmEvent, config: OdooConfig, rpc: OdooRpc = defaultRpc): Promise<number> {
  const uid = await rpc({ url: config.url, service: 'common', method: 'authenticate', args: [config.database, config.username, config.apiKey, {}] });
  if (typeof uid !== 'number') throw new Error('Odoo authentication failed');
  const payload = event.payload;
  const marker = `[mustaner-handoff:${createHash('sha256').update(event.idempotencyKey).digest('hex')}]`;
  const existing = await rpc({ url: config.url, service: 'object', method: 'execute_kw', args: [config.database, uid, config.apiKey, 'crm.lead', 'search_read', [[['description', 'ilike', marker]]], { fields: ['id'], limit: 1 }] });
  if (Array.isArray(existing) && typeof (existing[0] as { id?: unknown } | undefined)?.id === 'number') return (existing[0] as { id: number }).id;
  const leadId = await rpc({ url: config.url, service: 'object', method: 'execute_kw', args: [config.database, uid, config.apiKey, 'crm.lead', 'create', [{ name: `${event.type}: ${String(payload.name || payload.phone || 'New lead')}`, contact_name: payload.name || undefined, phone: payload.phone || undefined, description: `${marker}\n${event.summary}\n\n${JSON.stringify(payload)}`, type: 'lead' }]] });
  if (typeof leadId !== 'number') throw new Error('Odoo did not return a lead ID');
  return leadId;
}
