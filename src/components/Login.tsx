import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await api('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }); onSuccess(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Login failed'); } finally { setBusy(false); } }
  return <main className="login-shell"><section className="login-story" aria-label="Mustaner course intelligence"><div className="login-story-copy"><p className="story-kicker">Mustaner knowledge systems</p><h1>One source of truth for every course.</h1><p>Give your team—and your sales agent—the context to communicate value clearly.</p></div><img className="login-hero" src="/assets/login-hero.png" alt="Two professionals organizing course content" /></section><section className="login-form-panel"><div className="login-form-wrap"><img className="brand-logo login-logo" src="/assets/mustaner-logo.webp" alt="Mustaner" /><div className="login-heading-icon"><LockKeyhole aria-hidden="true" /></div><h2>Welcome back</h2><p className="muted">Enter the workspace password to continue.</p><form onSubmit={submit}><label className="field"><span>Workspace password</span><input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary wide" disabled={busy}>{busy ? 'Checking…' : <>Open workspace <ArrowRight size={17} /></>}</button></form></div></section></main>;
}
