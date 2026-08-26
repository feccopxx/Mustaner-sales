import { Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';

type AgentDraft = { id: string; persona: string };

export function AgentSettings() {
  const [draft, setDraft] = useState<AgentDraft>({ id: 'current', persona: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { api<AgentDraft>('/admin/agent-config/draft').then(setDraft).catch(error => setMessage(error instanceof Error ? error.message : 'Could not load agent draft')); }, []);

  async function save() {
    setBusy(true); setMessage('');
    try {
      await api('/admin/agent-config/draft', { method: 'PUT', body: JSON.stringify({ persona: draft.persona }) });
      setMessage('Agent draft saved. Live conversations are unchanged until publishing.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save agent draft'); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setMessage('');
    try {
      await api('/admin/agent-config/draft', { method: 'PUT', body: JSON.stringify({ persona: draft.persona }) });
      const result = await api<{ version: number }>('/admin/agent-config/publish', { method: 'POST' });
      setMessage(`Agent version ${result.version} published.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not publish agent version'); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-head"><div><p className="eyebrow">Live sales behavior</p><h1>Sales agent</h1><p>Edit a draft, then publish an immutable version for live conversations.</p></div></div>
    <article className="nested-card">
      <label className="field"><span>Agent persona and tone</span><textarea dir="auto" rows={14} value={draft.persona} onChange={event => setDraft(current => ({ ...current, persona: event.target.value }))} /></label>
      <div className="head-actions"><button className="secondary" disabled={busy || !draft.persona.trim()} onClick={save}><Save size={16} /> Save agent draft</button><button className="primary" disabled={busy || !draft.persona.trim()} onClick={publish}><Send size={16} /> Publish agent version</button></div>
      {message && <p dir="auto">{message}</p>}
    </article>
  </>;
}
