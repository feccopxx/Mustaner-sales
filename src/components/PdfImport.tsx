import { FileUp, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import type { Course } from '../types.js';

type Question = { field: keyof Pick<Course, 'id' | 'name' | 'shortDescription' | 'price' | 'curriculum' | 'howToSell'>; question: string };
type ImportResult = { draft: Course; questions: Question[] };

export function PdfImport({ onImport }: { onImport: (course: Course) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<Question['field'], string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function extract() {
    if (!file) return setError('Choose a PDF file to import.');
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('pdf', file);
      const imported = await api<ImportResult>('/admin/courses/import-pdf', { method: 'POST', body });
      if (imported.questions.length === 0) onImport(imported.draft);
      else setResult(imported);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The PDF could not be imported.'); }
    finally { setBusy(false); }
  }

  if (result) return <section className="pdf-import-result" aria-label="PDF import questions"><div><p className="eyebrow">A few details are missing</p><h2>Complete the course import</h2><p>Answer these questions, or continue to the editor and fill them in yourself.</p></div>{result.questions.map(({ field, question }) => <label className="field" key={field}><span>{question}</span><input value={answers[field] || ''} onChange={event => setAnswers({ ...answers, [field]: event.target.value })} /></label>)}<div className="head-actions"><button className="secondary" onClick={() => onImport(result.draft)}>Fill remaining data manually</button><button className="primary" onClick={() => onImport({ ...result.draft, ...answers })}>Apply answers</button></div></section>;

  return <section className="pdf-import" aria-label="Import course from PDF"><div><p className="eyebrow">Course import</p><h2>Start with a PDF</h2><p>Use AI to extract course details, then review everything before saving.</p></div><label className="file-picker"><FileUp size={18} /><span>Course PDF</span><input aria-label="Course PDF" type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] || null)} />{file && <small>{file.name}</small>}</label><button className="secondary" disabled={busy} onClick={extract}><Sparkles size={16} />{busy ? 'Extracting…' : 'Extract course details'}</button>{error && <p className="error" role="alert">{error}</p>}</section>;
}
