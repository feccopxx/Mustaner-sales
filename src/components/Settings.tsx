import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { CustomField } from '../types.js';
import { AgentSettings } from './AgentSettings.js';
import { MarkdownField } from './MarkdownField.js';

type GlobalField = CustomField & { id: string; position: number };

export function Settings() {
  const [fields, setFields] = useState<GlobalField[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try { setFields(await api<GlobalField[]>('/admin/global-fields')); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load global fields'); }
  };
  useEffect(() => { load(); }, []);

  const update = (id: string, patch: Partial<GlobalField>) => setFields(current => current.map(field => field.id === id ? { ...field, ...patch } : field));
  async function save(field: GlobalField) { setBusy(true); setError(''); try { await api(`/admin/global-fields/${field.id}`, { method: 'PUT', body: JSON.stringify(field) }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save global field'); } finally { setBusy(false); } }
  async function add() { setBusy(true); setError(''); try { await api('/admin/global-fields', { method: 'POST', body: JSON.stringify({ name: 'New global field', content: '', visibility: 'INTERNAL' }) }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add global field'); } finally { setBusy(false); } }
  async function remove(id: string) { setBusy(true); setError(''); try { await api(`/admin/global-fields/${id}`, { method: 'DELETE' }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove global field'); } finally { setBusy(false); } }

  return <section>
    <AgentSettings />
    <div className="page-head"><div><p className="eyebrow">Course templates</p><h1>Global fields</h1><p>Reusable custom-field templates copied into every new course. Editing a template never changes existing courses.</p></div><div className="head-actions"><button className="primary" disabled={busy} onClick={add}><Plus size={16} /> Add global field</button></div></div>
    {error && <div className="error banner">{error}</div>}
    <div className="settings-fields">
      {fields.length === 0 && <div className="inline-empty">No global fields yet. Add one to include it in every new course.</div>}
      {fields.map(field => <article className="nested-card" key={field.id}>
        <div className="two-col"><label className="field"><span>Field name</span><input dir="auto" value={field.name} onChange={event => update(field.id, { name: event.target.value })} /></label><label className="field"><span>Visibility</span><select value={field.visibility} onChange={event => update(field.id, { visibility: event.target.value as GlobalField['visibility'] })}><option value="INTERNAL">Internal</option><option value="PUBLIC">Public</option></select></label></div>
        <MarkdownField label="Default content" value={field.content} onChange={content => update(field.id, { content })} />
        <div className="head-actions"><button className="secondary" disabled={busy} onClick={() => save(field)}><Save size={16} /> Save field</button><button className="danger-text bordered" disabled={busy} onClick={() => remove(field.id)}><Trash2 size={15} /> Remove</button></div>
      </article>)}
    </div>
  </section>;
}
