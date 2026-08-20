import { Copy, KeyRound, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
type Key = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt?: string; revokedAt?: string };

export function ApiKeys() {
  const [keys, setKeys] = useState<Key[]>([]); const [name, setName] = useState('n8n sales agent'); const [sales, setSales] = useState(true); const [created, setCreated] = useState('');
  const load = () => api<Key[]>('/admin/api-keys').then(setKeys); useEffect(() => { load(); }, []);
  async function create() { const result = await api<{ key: string }>('/admin/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes: ['courses:read', ...(sales ? ['sales-guidance:read'] : [])] }) }); setCreated(result.key); load(); }
  async function revoke(id: string) { await api(`/admin/api-keys/${id}/revoke`, { method: 'POST' }); load(); }
  return <section><div className="page-head"><div><p className="eyebrow">Integration security</p><h1>API access</h1><p>Create scoped credentials for the sales agent and other trusted systems.</p></div></div>
    {created && <div className="secret-callout"><div><strong>Copy this key now</strong><code>{created}</code><small>It will never be displayed again.</small></div><button className="secondary" onClick={() => navigator.clipboard.writeText(created)}><Copy size={16} /> Copy</button></div>}
    <div className="create-key"><label className="field"><span>Key name</span><input value={name} onChange={event => setName(event.target.value)} /></label><label className="check"><input type="checkbox" checked={sales} onChange={event => setSales(event.target.checked)} /><span>Allow privileged sales guidance</span></label><button className="primary" onClick={create}><KeyRound size={16} /> Generate key</button></div>
    {keys.length === 0 ? <div className="illustrated-empty"><img src="/assets/empty-api-keys.png" alt="Professional securely connecting course data to an automation system" /><div><p className="eyebrow">Secure connections</p><h2>Connect your first system</h2><p>Generate a scoped key for the sales agent or another trusted integration.</p><button className="primary" onClick={create}><KeyRound size={16} /> Generate API key</button></div></div> : <div className="table-card"><table><thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th></th></tr></thead><tbody>{keys.map(key => <tr className={key.revokedAt ? 'dimmed' : ''} key={key.id}><td><strong>{key.name}</strong>{key.revokedAt && <small>Revoked</small>}</td><td><code>{key.prefix}…</code></td><td>{key.scopes.map(scope => <span className="chip" key={scope}>{scope}</span>)}</td><td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</td><td>{!key.revokedAt && <button className="danger-text" onClick={() => revoke(key.id)}><ShieldOff size={15} /> Revoke</button>}</td></tr>)}</tbody></table></div>}
  </section>;
}
